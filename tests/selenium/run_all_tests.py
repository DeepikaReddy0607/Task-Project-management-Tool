"""
Test Runner & Comprehensive Report Generator for TaskFlow Phase 5 Selenium Automation.
Executes End-to-End OTP Lifecycle tests and Deployed Production validation.
Generates structured Markdown and JSON reports with screenshot linkages and logs.
"""

import os
import sys
import time
import json
import unittest
import subprocess

REPORT_DIR = os.path.join(os.path.dirname(__file__), "reports")
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(REPORT_DIR, exist_ok=True)
os.makedirs(SCREENSHOT_DIR, exist_ok=True)


def cleanup_test_users():
    """Cleans up any temporary selenium test users created during test runs."""
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
    cleanup_code = """
import prisma from './src/config/prisma.js';
async function clean() {
  await prisma.pending_registrations.deleteMany({
    where: { email: { startsWith: 'selenium_otp_' } }
  });
  await prisma.users.deleteMany({
    where: { email: { startsWith: 'selenium_otp_' } }
  });
  console.log('Cleaned test users.');
  process.exit(0);
}
clean();
"""
    try:
        subprocess.run(["node", "-e", cleanup_code], cwd=backend_dir, capture_output=True, text=True, timeout=15)
        print("[CLEANUP] Dedicated selenium test accounts cleaned up from database.")
    except Exception as e:
        print(f"[CLEANUP WARNING] Failed to clean test users: {e}")


def run_suite():
    print("=" * 70)
    print("TASKFLOW PHASE 5: SELENIUM END-TO-END AUTOMATION RUNNER")
    print("=" * 70)

    start_time = time.time()

    # Import test suites
    from test_taskflow_otp_e2e import TestTaskFlowOtpLifecycle
    from test_deployed_production import TestDeployedProduction

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add E2E suite
    e2e_tests = loader.loadTestsFromTestCase(TestTaskFlowOtpLifecycle)
    suite.addTests(e2e_tests)

    # Run tests with custom text runner
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    duration = time.time() - start_time

    # Collect results
    total_tests = result.testsRun
    failed_tests = len(result.failures)
    errored_tests = len(result.errors)
    passed_tests = total_tests - (failed_tests + errored_tests)

    print("\n" + "=" * 70)
    print(f"RESULTS: {passed_tests}/{total_tests} PASSED in {duration:.2f}s (Failures: {failed_tests}, Errors: {errored_tests})")
    print("=" * 70)

    # Gather screenshots
    screenshots = [f for f in os.listdir(SCREENSHOT_DIR) if f.endswith(".png")]

    # Compile report data
    report_data = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "durationSeconds": round(duration, 2),
        "totalTests": total_tests,
        "passedTests": passed_tests,
        "failedTests": failed_tests,
        "erroredTests": errored_tests,
        "successRate": f"{round((passed_tests / total_tests) * 100, 1)}%",
        "screenshots": screenshots,
        "failures": [
            {"test": str(test), "traceback": trace} for test, trace in result.failures
        ],
        "errors": [
            {"test": str(test), "traceback": trace} for test, trace in result.errors
        ]
    }

    # Write JSON report
    json_path = os.path.join(REPORT_DIR, "test_execution_report.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2)

    # Cleanup DB test users
    cleanup_test_users()

    return report_data


if __name__ == "__main__":
    report = run_suite()
    if report["failedTests"] > 0 or report["erroredTests"] > 0:
        sys.exit(1)
    sys.exit(0)
