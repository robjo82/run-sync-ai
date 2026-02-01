
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

try:
    from app.services.conversational_coach_service import ConversationalCoachService
    print("SUCCESS: ConversationalCoachService imported successfully.")
except Exception as e:
    print(f"FAILED: {e}")
except SyntaxError as e:
    print(f"SYNTAX ERROR: {e}")
