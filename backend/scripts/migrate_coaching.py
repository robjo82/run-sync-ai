#!/usr/bin/env python3
"""
Migration script for conversational coaching system.

Creates coaching_threads and coaching_messages tables,
and adds is_archived column to existing tables.

Run with: python scripts/migrate_coaching.py
"""

from sqlalchemy import create_engine, text
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://runsync:runsync@db:5432/runsync")

def run_migration():
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as conn:
        # Create coaching_threads table
        print("Creating coaching_threads table...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS coaching_threads (
                id SERIAL PRIMARY KEY,
                race_goal_id INTEGER NOT NULL REFERENCES race_goals(id) ON DELETE CASCADE,
                title VARCHAR(200) DEFAULT 'Discussion avec le coach',
                description TEXT,
                is_archived BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        
        # Create index on race_goal_id
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_coaching_threads_race_goal_id 
            ON coaching_threads(race_goal_id)
        """))
        
        # Create index on is_archived
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_coaching_threads_is_archived 
            ON coaching_threads(is_archived)
        """))
        
        # Create coaching_messages table
        print("Creating coaching_messages table...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS coaching_messages (
                id SERIAL PRIMARY KEY,
                thread_id INTEGER NOT NULL REFERENCES coaching_threads(id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL,
                content TEXT NOT NULL,
                message_type VARCHAR(50) DEFAULT 'general',
                sessions_affected JSON,
                tokens_used INTEGER,
                processing_time_ms INTEGER,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        
        # Create index on thread_id
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_coaching_messages_thread_id 
            ON coaching_messages(thread_id)
        """))
        
        # Create index on created_at
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_coaching_messages_created_at 
            ON coaching_messages(created_at)
        """))
        
        # Add is_archived to race_goals if not exists
        print("Adding is_archived to race_goals...")
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='race_goals' AND column_name='is_archived'
                ) THEN
                    ALTER TABLE race_goals ADD COLUMN is_archived BOOLEAN DEFAULT FALSE;
                    CREATE INDEX ix_race_goals_is_archived ON race_goals(is_archived);
                END IF;
            END $$
        """))
        
        # Add is_archived to planned_sessions if not exists
        print("Adding is_archived to planned_sessions...")
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='planned_sessions' AND column_name='is_archived'
                ) THEN
                    ALTER TABLE planned_sessions ADD COLUMN is_archived BOOLEAN DEFAULT FALSE;
                    CREATE INDEX ix_planned_sessions_is_archived ON planned_sessions(is_archived);
                END IF;
            END $$
        """))
        
        # Add thread_message_id to planned_sessions if not exists
        print("Adding thread_message_id to planned_sessions...")
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='planned_sessions' AND column_name='thread_message_id'
                ) THEN
                    ALTER TABLE planned_sessions 
                    ADD COLUMN thread_message_id INTEGER REFERENCES coaching_messages(id);
                END IF;
            END $$
        """))
        
        # Migrate existing plan_explanation to coaching thread/message
        print("Migrating existing plan explanations to threads...")
        conn.execute(text("""
            DO $$
            DECLARE
                goal_rec RECORD;
                new_thread_id INTEGER;
                new_message_id INTEGER;
            BEGIN
                -- For each goal with a plan_explanation
                FOR goal_rec IN 
                    SELECT id, plan_explanation, name 
                    FROM race_goals 
                    WHERE plan_explanation IS NOT NULL 
                    AND plan_explanation != ''
                    AND NOT EXISTS (
                        SELECT 1 FROM coaching_threads WHERE race_goal_id = race_goals.id
                    )
                LOOP
                    -- Create a thread
                    INSERT INTO coaching_threads (race_goal_id, title, created_at)
                    VALUES (goal_rec.id, 'Plan initial - ' || goal_rec.name, NOW())
                    RETURNING id INTO new_thread_id;
                    
                    -- Create a system message with the explanation
                    INSERT INTO coaching_messages (thread_id, role, content, message_type, created_at)
                    VALUES (new_thread_id, 'coach', goal_rec.plan_explanation, 'explanation', NOW())
                    RETURNING id INTO new_message_id;
                    
                    RAISE NOTICE 'Migrated goal % to thread %', goal_rec.id, new_thread_id;
                END LOOP;
            END $$
        """))
        
        conn.commit()
        print("✅ Migration completed successfully!")


if __name__ == "__main__":
    run_migration()
