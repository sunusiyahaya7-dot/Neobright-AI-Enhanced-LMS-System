"""
Test script for AI endpoints
"""
import requests
import json
import os
from dotenv import load_dotenv

# Load environment
load_dotenv()

# Test configuration
BASE_URL = "http://localhost:5000"
HEADERS = {"Content-Type": "application/json"}

# You'll need a valid Firebase token to test authenticated endpoints
# For now, we'll just test the structure

def test_health_check():
    """Test basic health endpoint"""
    print("\n=== Testing Health Check ===")
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_ai_context_endpoint():
    """Test /api/ai/context endpoint (requires auth)"""
    print("\n=== Testing /api/ai/context ===")
    print("Note: This endpoint requires Firebase authentication token")
    print("To test with valid token, add 'Authorization: Bearer <token>' header")
    print("Endpoint structure: GET /api/ai/context")
    print("Expected response: StudentContext with courses and analytics")

def test_ai_insights_endpoint():
    """Test /api/ai/insights endpoint (requires auth)"""
    print("\n=== Testing /api/ai/insights ===")
    print("Note: This endpoint requires Firebase authentication token")
    print("To test with valid token, add 'Authorization: Bearer <token>' header")
    print("Endpoint structure: GET /api/ai/insights")
    print("Expected response: AiInsights with summary, strengths, areas_to_improve, actions")

def verify_imports():
    """Verify all required imports work"""
    print("\n=== Verifying Imports ===")
    try:
        from api.ai_routes import ai_bp
        print("✓ ai_routes imported successfully")
        
        from services.ai_service import AiService
        print("✓ AiService imported successfully")
        
        from services.ai_context_service import AIContextService
        print("✓ AIContextService imported successfully")
        
        from models.ai_models import AiInsights, StudentContext
        print("✓ AI models imported successfully")
        
        from openai import OpenAI
        print("✓ OpenAI imported successfully")
        
        return True
    except Exception as e:
        print(f"✗ Import error: {e}")
        return False

if __name__ == "__main__":
    print("NeoBright AI Endpoints Test Suite")
    print("=" * 50)
    
    # Test imports first
    if verify_imports():
        print("\n✓ All imports successful!")
    else:
        print("\n✗ Import verification failed!")
        exit(1)
    
    # Test health check (doesn't require auth)
    if test_health_check():
        print("✓ Health check passed!")
    else:
        print("✗ Health check failed!")
    
    # Test AI endpoints structure
    test_ai_context_endpoint()
    test_ai_insights_endpoint()
    
    print("\n" + "=" * 50)
    print("Manual Testing Instructions:")
    print("1. Start Flask server: python app.py")
    print("2. Get a valid Firebase token from your frontend")
    print("3. Test authenticated endpoint with curl or Postman:")
    print("   curl -H 'Authorization: Bearer <token>' http://localhost:5000/api/ai/insights")
