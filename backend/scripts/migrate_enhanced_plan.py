"""
Database migration script to add enhanced training plan fields.
Run this inside Docker: docker exec -it run-sync-backend python scripts/migrate_enhanced_plan.py
"""

import sys
sys.path.insert(0, "/app")

from app.database import engine
from sqlalchemy import text

def run_migration():
    """Add new columns for enhanced training plans."""
    
    migrations = [
        # PlannedSession new columns
        """ALTER TABLE planned_sessions 
           ADD COLUMN IF NOT EXISTS target_pace_per_km INTEGER;""",
        
        """ALTER TABLE planned_sessions 
           ADD COLUMN IF NOT EXISTS terrain_type VARCHAR(50) DEFAULT 'road';""",
        
        """ALTER TABLE planned_sessions 
           ADD COLUMN IF NOT EXISTS elevation_gain INTEGER DEFAULT 0;""",
        
        """ALTER TABLE planned_sessions 
           ADD COLUMN IF NOT EXISTS intervals JSON;""",
        
        """ALTER TABLE planned_sessions 
           ADD COLUMN IF NOT EXISTS workout_details TEXT;""",
        
        # RaceGoal new columns
        """ALTER TABLE race_goals 
           ADD COLUMN IF NOT EXISTS plan_explanation TEXT;""",
    ]
    
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                print(f"✓ Executed: {sql[:60]}...")
            except Exception as e:
                if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                    print(f"⊘ Column already exists, skipping: {sql[:60]}...")
                else:
                    print(f"✗ Error: {e}")
        
        conn.commit()
    
    print("\n✓ Migration completed successfully!")

if __name__ == "__main__":
    run_migration()
