from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import logging

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

def start_scheduler():
    if not scheduler.running:
        scheduler.start()
        logger.info("Scheduler started")

def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()

def add_profile_job(profile_id: int, cron_expr: str, job_func):
    job_id = f"profile_{profile_id}"
    # Remove existing job if any
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    parts = cron_expr.strip().split()
    if len(parts) == 5:
        minute, hour, day, month, day_of_week = parts
        trigger = CronTrigger(
            minute=minute, hour=hour, day=day,
            month=month, day_of_week=day_of_week
        )
        scheduler.add_job(job_func, trigger=trigger, id=job_id, args=[profile_id])
        logger.info(f"Scheduled job for profile {profile_id}: {cron_expr}")

def remove_profile_job(profile_id: int):
    job_id = f"profile_{profile_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

def list_jobs() -> list[dict]:
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "next_run": str(job.next_run_time) if job.next_run_time else None,
        })
    return jobs
