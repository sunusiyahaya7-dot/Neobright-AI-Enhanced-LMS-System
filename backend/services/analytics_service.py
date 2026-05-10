"""
Learning Analytics Service for NeoBright LMS.
Computes rule-based analytics from progress data.
"""
from typing import Dict, List, Optional, Literal
from datetime import datetime, timedelta, date
from calendar import monthrange
from services.firestore_service import FirestoreService
from services.progress_service import ProgressService


class AnalyticsService:
    """Service for computing learning analytics."""

    Granularity = Literal["week", "month", "year"]

    @staticmethod
    def compute_progress_trend(
        firebase_uid: str,
        course_id: int,
        granularity: "AnalyticsService.Granularity" = "week",
        *,
        year: Optional[int] = None,
        month: Optional[int] = None,
    ) -> List[Dict]:
        """Compute learning progress trend grouped by week, month, or year.

        Returns a list of points:
        [
            {"label": "2026-W19", "progress": 42.5},
            {"label": "2026-W20", "progress": 48.0},
        ]

        Notes:
        - Uses Firestore user-marked completions timestamps when available.
        - Scales to match the current cached course progress when the requested
          period includes "today".
        - Falls back to a simple linear trend if no timestamped completions exist.
        """

        def start_of_week(d: date) -> date:
            # Monday as the first day of the week
            return d - timedelta(days=d.weekday())

        def clamp_int(v: Optional[int], *, min_value: int, max_value: int) -> Optional[int]:
            if v is None:
                return None
            try:
                v_int = int(v)
            except Exception:
                return None
            if v_int < min_value or v_int > max_value:
                return None
            return v_int

        try:
            cached_progress = ProgressService.get_cached_course_progress(firebase_uid, course_id)
            if not cached_progress:
                return []

            total_activities = int(cached_progress.get("total") or 0)
            current_progress = float(cached_progress.get("progress") or 0.0)

            # Build completion timeline from Firestore (user-marked)
            completion_dates: List[datetime] = []
            try:
                fs = FirestoreService()
                activities_ref = (
                    fs.db.collection("completions")
                    .document(firebase_uid)
                    .collection("courses")
                    .document(str(course_id))
                    .collection("activities")
                )
                docs = activities_ref.where("isComplete", "==", True).stream()
                for doc in docs:
                    data = doc.to_dict() or {}
                    dt = data.get("completedAt")
                    if isinstance(dt, datetime):
                        # Normalize timezone-aware to naive for comparisons
                        if dt.tzinfo is not None:
                            dt = dt.replace(tzinfo=None)
                        completion_dates.append(dt)
            except Exception:
                # Non-fatal: trend will fall back to linear below
                completion_dates = []

            completion_dates.sort()

            today = datetime.utcnow().date()

            granularity = (granularity or "week").lower()  # type: ignore[assignment]
            if granularity not in ("week", "month", "year"):
                return []

            # Determine bucket boundaries (inclusive end dates)
            boundaries: List[tuple[str, date, date]] = []  # (label, start_date, end_date)

            if granularity == "week":
                # Last 5 weeks including the current week
                current_week_start = start_of_week(today)
                week_starts = [current_week_start - timedelta(weeks=i) for i in range(4, -1, -1)]
                for ws in week_starts:
                    we = ws + timedelta(days=6)
                    iso = ws.isocalendar()
                    label = f"{iso.year}-W{iso.week:02d}"
                    boundaries.append((label, ws, we))

            elif granularity == "month":
                year = clamp_int(year, min_value=1970, max_value=2100)
                month = clamp_int(month, min_value=1, max_value=12)
                if year is None or month is None:
                    return []

                first = date(year, month, 1)
                last = date(year, month, monthrange(year, month)[1])

                ws = start_of_week(first)
                idx = 1
                while ws <= last:
                    we = min(ws + timedelta(days=6), last)
                    label = f"Wk {idx}"
                    boundaries.append((label, ws, we))
                    idx += 1
                    ws = ws + timedelta(weeks=1)

            else:  # year
                year = clamp_int(year, min_value=1970, max_value=2100)
                if year is None:
                    return []
                for m in range(1, 13):
                    start = date(year, m, 1)
                    end = date(year, m, monthrange(year, m)[1])
                    label = start.strftime("%b")
                    boundaries.append((label, start, end))

            if not boundaries or total_activities <= 0:
                # No way to compute percent; still return a stable shape if possible
                return [{"label": b[0], "progress": 0.0} for b in boundaries]

            # Raw trend from timestamped completions
            def count_completions_up_to(end_inclusive: date) -> int:
                # completion_dates is sorted
                c = 0
                for dt in completion_dates:
                    if dt.date() <= end_inclusive:
                        c += 1
                    else:
                        break
                return c

            raw_points: List[Dict] = []
            for label, _start, end in boundaries:
                completed = count_completions_up_to(end)
                completed = max(0, min(completed, total_activities))
                pct = round((completed / total_activities) * 100.0, 1)
                raw_points.append({"label": label, "progress": pct})

            # Scale to match cached current progress only when the requested period
            # includes today (e.g., current month/year).
            period_start = boundaries[0][1]
            period_end = boundaries[-1][2]
            includes_today = period_start <= today <= period_end

            final_raw = float(raw_points[-1]["progress"]) if raw_points else 0.0

            if includes_today and current_progress > 0:
                if final_raw > 0:
                    scale = current_progress / final_raw
                    for p in raw_points:
                        p["progress"] = round(min(100.0, float(p["progress"]) * scale), 1)
                else:
                    # Fallback: linear ramp to current progress
                    steps = len(raw_points)
                    for i, p in enumerate(raw_points):
                        p["progress"] = round((current_progress / steps) * (i + 1), 1)

            return raw_points

        except Exception as e:
            print(f"Error computing progress trend: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    @staticmethod
    def compute_weekly_progress(firebase_uid: str, course_id: int) -> List[Dict]:
        """
        Compute weekly progress trend for a course.
        
        Returns:
        [
            { "week": "Week 1", "progress": 25 },
            { "week": "Week 2", "progress": 50 }
        ]
        """
        try:
            # Get current progress from cache or compute it
            cached_progress = ProgressService.get_cached_course_progress(firebase_uid, course_id)
            
            if not cached_progress:
                # If no cached progress, return empty
                return []
            
            current_progress = cached_progress.get("progress", 0.0)
            
            # Generate weekly trend based on current progress
            # Assuming linear progression towards current progress
            weeks_back = 4
            weekly_data = []
            
            for i in range(weeks_back, 0, -1):
                week_num = weeks_back - i + 1
                # Generate incremental progress towards current
                simulated_progress = round((current_progress / weeks_back) * week_num, 1)
                weekly_data.append({
                    "week": f"Week {week_num}",
                    "progress": simulated_progress
                })
            
            # Add current week with actual progress
            weekly_data.append({
                "week": f"Week {weeks_back + 1}",
                "progress": round(current_progress, 1)
            })
            
            print(f"Generated weekly progress for user {firebase_uid}, course {course_id}: {weekly_data}")
            return weekly_data
        
        except Exception as e:
            print(f"Error computing weekly progress: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    @staticmethod
    def compute_completion_velocity(firebase_uid: str, course_id: int) -> float:
        """
        Compute completion velocity (activities per week).
        
        Returns:
            float: Activities completed per week
        """
        try:
            fs = FirestoreService()
            
            # Get progress data
            progress_doc = fs.db.collection("progress").document(firebase_uid).collection(
                "courses"
            ).document(str(course_id)).get()
            
            if not progress_doc.exists:
                return 0.0
            
            progress_data = progress_doc.to_dict()
            completed = progress_data.get("completed", 0)
            last_synced = progress_data.get("lastSynced")
            
            if not last_synced or completed == 0:
                return 0.0
            
            # Calculate weeks since course started (simplified)
            # In production, you'd track actual enrollment date
            now = datetime.utcnow()
            if isinstance(last_synced, datetime):
                # Ensure both datetimes are naive (no timezone)
                if last_synced.tzinfo is not None:
                    last_synced = last_synced.replace(tzinfo=None)
                time_diff = now - last_synced
            else:
                # Assume at least 1 week of activity
                time_diff = timedelta(weeks=1)
            
            weeks_active = max(1, time_diff.days / 7)
            velocity = completed / weeks_active
            
            return round(velocity, 2)
        
        except Exception as e:
            print(f"Error computing velocity: {e}")
            return 0.0
    
    @staticmethod
    def compute_engagement_frequency(firebase_uid: str, course_id: int) -> Dict:
        """
        Compute engagement frequency metrics.
        
        Returns:
        {
            "lastActive": timestamp,
            "inactiveDays": 5,
            "engagementLevel": "low" | "medium" | "high"
        }
        """
        try:
            fs = FirestoreService()
            
            # Get user completions to determine last activity
            completions_ref = fs.db.collection("completions").document(firebase_uid).collection(
                "courses"
            ).document(str(course_id)).collection("activities")
            
            docs = completions_ref.order_by("completedAt", direction="DESCENDING").limit(1).stream()
            last_activity = None
            
            for doc in docs:
                data = doc.to_dict()
                last_activity = data.get("completedAt")
                break
            
            now = datetime.utcnow()
            
            if last_activity:
                if isinstance(last_activity, datetime):
                    # Ensure both datetimes are naive (no timezone)
                    if last_activity.tzinfo is not None:
                        last_activity_naive = last_activity.replace(tzinfo=None)
                    else:
                        last_activity_naive = last_activity
                    inactive_days = (now - last_activity_naive).days
                else:
                    inactive_days = 0
            else:
                # Check progress last sync
                progress_doc = fs.db.collection("progress").document(firebase_uid).collection(
                    "courses"
                ).document(str(course_id)).get()
                
                if progress_doc.exists:
                    last_synced = progress_doc.to_dict().get("lastSynced")
                    if isinstance(last_synced, datetime):
                        # Ensure both datetimes are naive (no timezone)
                        if last_synced.tzinfo is not None:
                            last_synced = last_synced.replace(tzinfo=None)
                        inactive_days = (now - last_synced).days
                    else:
                        inactive_days = 7  # Default assumption
                else:
                    inactive_days = 7
            
            # Determine engagement level
            if inactive_days <= 1:
                engagement_level = "high"
            elif inactive_days <= 3:
                engagement_level = "medium"
            else:
                engagement_level = "low"
            
            return {
                "lastActive": last_activity.isoformat() if isinstance(last_activity, datetime) else None,
                "inactiveDays": inactive_days,
                "engagementLevel": engagement_level
            }
        
        except Exception as e:
            print(f"Error computing engagement: {e}")
            return {
                "lastActive": None,
                "inactiveDays": 7,
                "engagementLevel": "low"
            }
    
    @staticmethod
    def detect_risk_level(firebase_uid: str, course_id: int) -> str:
        """
        Detect student risk level using rule-based logic.
        
        Rules:
        - high: progress < 30% AND inactive > 7 days
        - medium: progress < 60% OR inactive > 3 days
        - low: otherwise
        
        Returns:
            str: "low" | "medium" | "high"
        """
        try:
            fs = FirestoreService()
            
            # Get progress
            progress_doc = fs.db.collection("progress").document(firebase_uid).collection(
                "courses"
            ).document(str(course_id)).get()
            
            if not progress_doc.exists:
                return "high"  # No data = high risk
            
            progress_data = progress_doc.to_dict()
            progress = progress_data.get("progress", 0)
            
            # Get engagement
            engagement = AnalyticsService.compute_engagement_frequency(firebase_uid, course_id)
            inactive_days = engagement.get("inactiveDays", 7)
            
            # Apply risk rules
            if progress < 30 and inactive_days > 7:
                return "high"
            elif progress < 60 or inactive_days > 3:
                return "medium"
            else:
                return "low"
        
        except Exception as e:
            print(f"Error detecting risk: {e}")
            return "medium"
    
    @staticmethod
    def compute_course_analytics(firebase_uid: str, course_id: int) -> Dict:
        """
        Compute comprehensive analytics for a course.
        
        Returns:
        {
            "courseId": 5,
            "weeklyProgress": [...],
            "velocity": 3.2,
            "engagement": {...},
            "riskLevel": "medium",
            "lastUpdated": timestamp
        }
        """
        try:
            weekly_progress = AnalyticsService.compute_weekly_progress(firebase_uid, course_id)
            velocity = AnalyticsService.compute_completion_velocity(firebase_uid, course_id)
            engagement = AnalyticsService.compute_engagement_frequency(firebase_uid, course_id)
            risk_level = AnalyticsService.detect_risk_level(firebase_uid, course_id)
            
            analytics = {
                "courseId": course_id,
                "weeklyProgress": weekly_progress,
                "velocity": velocity,
                "engagement": engagement,
                "riskLevel": risk_level,
                "lastUpdated": datetime.utcnow().isoformat()
            }
            
            # Cache analytics in Firestore
            AnalyticsService.cache_analytics(firebase_uid, course_id, analytics)
            
            return analytics
        
        except Exception as e:
            print(f"Error computing course analytics: {e}")
            import traceback
            traceback.print_exc()
            return {
                "courseId": course_id,
                "weeklyProgress": [],
                "velocity": 0.0,
                "engagement": {"inactiveDays": 7, "engagementLevel": "low"},
                "riskLevel": "medium",
                "lastUpdated": datetime.utcnow().isoformat()
            }
    
    @staticmethod
    def cache_analytics(firebase_uid: str, course_id: int, analytics: Dict) -> None:
        """
        Cache analytics data in Firestore.
        """
        try:
            fs = FirestoreService()
            
            fs.db.collection("analytics").document(firebase_uid).collection(
                "courses"
            ).document(str(course_id)).set(analytics, merge=True)
            
            print(f"Cached analytics for user {firebase_uid}, course {course_id}")
        
        except Exception as e:
            print(f"Error caching analytics: {e}")
            import traceback
            traceback.print_exc()
    
    @staticmethod
    def get_analytics_overview(firebase_uid: str, course_ids: List[int]) -> Dict:
        """
        Get analytics overview across all courses.
        
        Returns:
        {
            "overallRisk": "medium",
            "averageVelocity": 2.8,
            "totalCoursesAtRisk": 2,
            "courses": [...]
        }
        """
        try:
            course_analytics = []
            total_velocity = 0
            courses_at_risk = 0
            
            for course_id in course_ids:
                analytics = AnalyticsService.compute_course_analytics(firebase_uid, course_id)
                course_analytics.append(analytics)
                total_velocity += analytics.get("velocity", 0)
                
                if analytics.get("riskLevel") in ["high", "medium"]:
                    courses_at_risk += 1
            
            avg_velocity = total_velocity / len(course_ids) if course_ids else 0
            
            # Determine overall risk
            if courses_at_risk >= len(course_ids) * 0.5:
                overall_risk = "high"
            elif courses_at_risk > 0:
                overall_risk = "medium"
            else:
                overall_risk = "low"
            
            return {
                "overallRisk": overall_risk,
                "averageVelocity": round(avg_velocity, 2),
                "totalCoursesAtRisk": courses_at_risk,
                "courses": course_analytics
            }
        
        except Exception as e:
            print(f"Error computing analytics overview: {e}")
            import traceback
            traceback.print_exc()
            return {
                "overallRisk": "medium",
                "averageVelocity": 0.0,
                "totalCoursesAtRisk": 0,
                "courses": []
            }
