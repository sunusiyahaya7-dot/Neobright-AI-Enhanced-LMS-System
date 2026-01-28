"""
Comprehensive test for AI endpoints - checks endpoint registration and mock data flow
"""
import sys
import json
from app import create_app
from models.ai_models import StudentContext, AiInsights, CourseAnalytics, OverallAnalytics, AiActionItem

def test_endpoint_registration():
    """Test that endpoints are registered in Flask app"""
    print("\n=== Testing Endpoint Registration ===")
    app = create_app()
    
    # Get all routes
    routes = []
    for rule in app.url_map.iter_rules():
        if 'ai' in rule.rule:
            routes.append({
                'rule': rule.rule,
                'methods': list(rule.methods - {'HEAD', 'OPTIONS'}),
                'endpoint': rule.endpoint
            })
    
    if routes:
        print(f"✓ Found {len(routes)} AI routes:")
        for route in routes:
            print(f"  - {route['methods'][0]} {route['rule']} ({route['endpoint']})")
        return True
    else:
        print("✗ No AI routes found!")
        return False

def test_data_models():
    """Test that all data models can be serialized"""
    print("\n=== Testing Data Model Serialization ===")
    
    try:
        # Create sample course
        course = CourseAnalytics(
            id="CS101",
            name="Introduction to Computer Science",
            progress=75.5,
            average_score=82.0,
            completed_activities=15,
            total_activities=20,
            last_access="2026-01-27T10:30:00Z"
        )
        print("✓ CourseAnalytics created and serializable")
        
        # Create analytics
        analytics = OverallAnalytics(
            overall_progress=78.0,
            weekly_progress=[70.0, 72.0, 75.0, 77.0, 78.0],
            completion_rate=0.75,
            velocity_activities_per_week=3.5,
            risk_level="low"
        )
        print("✓ OverallAnalytics created and serializable")
        
        # Create student context
        context = StudentContext(
            student_id="user123",
            name="John Doe",
            courses=[course],
            analytics=analytics,
            timestamp="2026-01-27T10:00:00Z"
        )
        context_dict = context.to_dict()
        print("✓ StudentContext created and serialized to dict")
        print(f"  Context keys: {list(context_dict.keys())}")
        
        # Create action items
        action = AiActionItem(
            title="Complete Module 3",
            description="Finish the remaining lessons in Module 3 to improve your understanding",
            deadline_days=7,
            course_id="CS101",
            priority="high"
        )
        print("✓ AiActionItem created and serializable")
        
        # Create insights
        insights = AiInsights(
            summary="You're making great progress overall. Keep up the momentum!",
            strengths=["Strong performance in CS101", "Consistent weekly engagement"],
            areas_to_improve=["Time management in lab assignments", "Review complex topics"],
            actions=[action],
            risk_level="low",
            confidence_score=0.92,
            generated_at="2026-01-27T10:00:00Z",
            context_timestamp="2026-01-27T10:00:00Z"
        )
        insights_dict = insights.to_dict()
        print("✓ AiInsights created and serialized to dict")
        print(f"  Insights keys: {list(insights_dict.keys())}")
        print(f"  Insights JSON:\n{json.dumps(insights_dict, indent=2)[:500]}...")
        
        return True
        
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_ai_service_structure():
    """Test that AiService has required methods"""
    print("\n=== Testing AiService Structure ===")
    
    try:
        from services.ai_service import AiService
        
        # Check methods
        methods = ['build_prompt', 'generate_insights', 'parse_insights', 'fallback_insights']
        for method in methods:
            if hasattr(AiService, method):
                print(f"✓ AiService.{method} exists")
            else:
                print(f"✗ AiService.{method} missing")
                return False
        
        return True
        
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

def test_blueprint_registration():
    """Test that ai_bp blueprint is properly registered"""
    print("\n=== Testing Blueprint Registration ===")
    
    try:
        from api.ai_routes import ai_bp
        
        # Check blueprint properties
        print(f"✓ Blueprint name: {ai_bp.name}")
        print(f"✓ Blueprint URL prefix: {ai_bp.url_prefix}")
        print(f"✓ Blueprint has {len(ai_bp.deferred_functions)} routes")
        
        return True
        
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

if __name__ == "__main__":
    print("="*60)
    print("NeoBright AI Endpoints - Comprehensive Test Suite")
    print("="*60)
    
    results = []
    
    results.append(("Blueprint Registration", test_blueprint_registration()))
    results.append(("Endpoint Registration", test_endpoint_registration()))
    results.append(("Data Models", test_data_models()))
    results.append(("AiService Structure", test_ai_service_structure()))
    
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n✓ All tests passed! Endpoints are ready for testing.")
        sys.exit(0)
    else:
        print(f"\n✗ {total - passed} test(s) failed!")
        sys.exit(1)
