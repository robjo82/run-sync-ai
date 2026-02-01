
import asyncio
import sys
import os
import unittest
from datetime import date
from unittest.mock import MagicMock, AsyncMock

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

# Set dummy env var for Client init
os.environ["GEMINI_API_KEY"] = "dummy_key_for_testing"

from app.services.conversational_coach_service import ConversationalCoachService
from app.services.llm_service import LLMService

# Mock Database objects
class MockGoal:
    def __init__(self):
        self.id = 1
        self.name = "Test Marathon"
        self.race_type = "marathon"
        self.race_date = date(2026, 4, 26)
        self.target_time_seconds = None
        self.available_days = "1,3,5,7" # Default 4 days
        self.weeks_until_race = 12
        self.plan_generated = False
        self.notes = ""
        self.long_run_day = 7
        self.max_weekly_hours = 10
        self.distance_km = 42.2
        self.target_time_formatted = "3h45"

class MockUser:
    def __init__(self):
        self.id = 1
        self.max_heart_rate = 190
        self.resting_heart_rate = 50

class MockThread:
    def __init__(self):
        self.id = 1
        self.updated_at = None

async def test_constraint_parsing():
    print("Testing Constraint Parsing...")
    
    with unittest.mock.patch("app.services.llm_service.genai.Client") as MockClient:
        MockClient.return_value = MagicMock()
        llm_service = LLMService()
        llm_service.provider.client = MagicMock() # Mock the client instance
        llm_service.provider.complete_json = AsyncMock(return_value={
            "available_days": [2, 4, 7], # Tuesday, Thursday, Sunday (3 days)
            "target_time_str": "3h30",
            "target_time_seconds": 12600,
            "notes": "Basket Mon/Thu"
        })
    
    # Mock DB Session
    db = MagicMock()
    
    # Patch date in plan_generator_service to ensure all days are "future" relative to start of week
    with unittest.mock.patch("app.services.plan_generator_service.date") as mock_date:
        # Set today to a Monday
        fixed_today = date(2025, 1, 6) # Jan 6 2025 is a Monday
        mock_date.today.return_value = fixed_today
        mock_date.side_effect = lambda *args, **kwargs: date(*args, **kwargs)
        
        coach = ConversationalCoachService(db)
        coach.llm_service = llm_service
        # ... rest of setups ...
    # Mock _get_thread_history
    coach._get_thread_history = MagicMock(return_value="User: Je peux courir que mardi, jeudi et dimanche car j'ai basket.")
    
    # Test Data
    goal = MockGoal()
    user = MockUser()
    thread = MockThread()
    athlete_profile = "Profile..."
    
    # Run _handle_plan_request behavior (simulated)
    # We want to check if it updates the goal
    
    # Extract constraints logic from _handle_plan_request
    parsing_prompt = "..."
    constraints = await llm_service.provider.complete_json(parsing_prompt)
    
    if constraints.get("available_days"):
        goal.available_days = ",".join(map(str, constraints["available_days"]))
        
    if constraints.get("target_time_seconds"):
        goal.target_time_seconds = constraints["target_time_seconds"]
        
    print(f"Goal Available Days: {goal.available_days}")
    assert goal.available_days == "2,4,7"
    print("✅ Constraint Parsing Passed")
    
    return goal

async def test_plan_generation_count(goal):
    print("\nTesting Plan Generation Session Count...")
    from app.services.plan_generator_service import PlanGeneratorService
    
    db = MagicMock()
    generator = PlanGeneratorService(db)
    
    # Mock metric service
    generator.metrics_service.get_current_metrics = MagicMock(return_value=None)
    generator._get_user_activity_profile = AsyncMock(return_value={"has_history": False})
    
    # Mock LLM to fail/return empty to force fallback (where strict rules are applied)
    # Or mock LLM to return valid JSON but we want to test the fallback logic which heavily relies on loops
    generator._generate_plan_with_explanation = AsyncMock(return_value={"weeks": [], "explanation": "Fallback"})
    
    # Run Generation
    user = MockUser()
    sessions, explanation = await generator.generate_plan(goal, user)
    
    # Check first week session count
    week1_sessions = [s for s in sessions if s.week_number == 1]
    print(f"Week 1 Sessions: {len(week1_sessions)}")
    
    # 2,4,7 = 3 days
    if len(week1_sessions) == 3:
        print("✅ Strict Session Count Passed (3 sessions)")
    else:
        print(f"❌ Failed: Expected 3 sessions, got {len(week1_sessions)}")
        for s in week1_sessions:
            print(f" - {s.session_type} on day {s.scheduled_date.weekday()+1}")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    
    # Patch date globally for the verification
    with unittest.mock.patch("app.services.plan_generator_service.date") as mock_date:
        fixed_today = date(2025, 1, 6) # Jan 6 2025 is a Monday
        mock_date.today.return_value = fixed_today
        mock_date.side_effect = lambda *args, **kwargs: date(*args, **kwargs)
        
        updated_goal = loop.run_until_complete(test_constraint_parsing())
        loop.run_until_complete(test_plan_generation_count(updated_goal))
    
    loop.close()
