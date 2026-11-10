"""
Selenium End-to-End Test Suite for TaskFlow Email OTP Verification & Complete Lifecycle
Covers: Registration -> OTP Verification -> First-time Onboarding -> Dashboard -> Logout -> Returning Login

Requirements:
- Python & Selenium
- Explicit waits (WebDriverWait, EC)
- Dedicated test accounts
- Controlled test-only OTP retrieval via backend/src/scripts/getTestOtp.js
- Zero regression / zero destructive operations
- Capture screenshots for all test steps
"""

import os
import sys
import time
import subprocess
import unittest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE_URL = os.environ.get("TASKFLOW_BASE_URL", "http://localhost:5173")
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

# Generate unique test user credentials for this execution
TIMESTAMP = int(time.time())
TEST_USER = {
    "firstName": "Selenium",
    "lastName": "Tester",
    "email": f"selenium_otp_{TIMESTAMP}@taskflow.dev",
    "password": "SecurePassword123!",
    "phone": "+1234567890",
}


def retrieve_test_otp(email):
    """
    Controlled test-only OTP retrieval mechanism.
    Executes getTestOtp.js which queries the database HMAC hash and resolves the 6-digit code.
    Does not expose OTP via public API or logs.
    """
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
    script_path = os.path.join(backend_dir, "src", "scripts", "getTestOtp.js")

    cmd = ["node", script_path, email]
    result = subprocess.run(cmd, cwd=backend_dir, capture_output=True, text=True)

    if result.returncode != 0:
        raise RuntimeError(f"Failed to retrieve OTP via test helper: {result.stderr.strip()}")

    # Output lines may contain dotenv/prisma warnings, the last line is the 6-digit OTP
    lines = [line.strip() for line in result.stdout.strip().splitlines() if line.strip().isdigit() and len(line.strip()) == 6]
    if not lines:
        raise ValueError(f"No valid 6-digit OTP found in helper output: {result.stdout}")

    return lines[-1]


class TestTaskFlowOtpLifecycle(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--force-prefers-reduced-motion")
        options.add_argument("--window-size=1440,900")
        options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
        options.binary_location = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

        cls.driver = webdriver.Chrome(options=options)
        cls.wait = WebDriverWait(cls.driver, 15)
        cls.screenshots = {}

    @classmethod
    def tearDownClass(cls):
        if cls.driver:
            cls.driver.quit()

    def capture_screenshot(self, name):
        filename = f"{name}.png"
        path = os.path.join(SCREENSHOT_DIR, filename)
        self.driver.save_screenshot(path)
        self.screenshots[name] = path
        return path

    def wait_for_login_card_settled(self):
        """Waits for login page card to reveal and become interactable (settling intro animation)."""
        def card_is_interactable(driver):
            try:
                elem = driver.find_element(By.ID, "email")
                is_inert = driver.execute_script("return arguments[0].closest('[inert]') !== null;", elem)
                return (not is_inert) and elem.is_displayed() and elem.is_enabled()
            except Exception:
                return False

        self.wait.until(card_is_interactable)
        return self.wait.until(EC.element_to_be_clickable((By.ID, "email")))

    # -------------------------------------------------------------
    # 1. Open Registration Page
    # -------------------------------------------------------------
    def test_01_open_registration_page(self):
        """Case 1: Open registration page and verify layout and TaskFlow branding."""
        self.driver.set_window_size(1440, 900)
        self.driver.get(f"{BASE_URL}/register")

        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "main")))
        self.assertIn("TaskFlow", self.driver.title)

        heading = self.wait.until(EC.visibility_of_element_located((By.XPATH, "//*[contains(text(), 'Create your account')]")))
        self.assertIsNotNone(heading)
        self.capture_screenshot("01_registration_page")
        print("[PASS] Case 1: Open registration page")

    # -------------------------------------------------------------
    # Additional: Empty Registration Validation
    # -------------------------------------------------------------
    def test_02_empty_fields_validation(self):
        """Additional: Submit empty registration and verify field validation."""
        self.driver.get(f"{BASE_URL}/register")
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "form")))

        submit_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Create account')]")
        submit_btn.click()

        # Check validation errors appear
        errors = self.wait.until(EC.presence_of_all_elements_located(
            (By.XPATH, "//*[contains(text(), 'required') or contains(text(), 'Enter a valid')]")
        ))
        self.assertGreaterEqual(len(errors), 3)
        self.capture_screenshot("02_empty_registration_validation")
        print(f"[PASS] Case 2: Empty fields validation ({len(errors)} errors found)")

    # -------------------------------------------------------------
    # Additional: Existing Email Registration
    # -------------------------------------------------------------
    def test_03_existing_email_registration(self):
        """Additional: Attempt registration with an already registered email."""
        self.driver.get(f"{BASE_URL}/register")
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "form")))

        self.driver.find_element(By.NAME, "firstName").send_keys("Existing")
        self.driver.find_element(By.NAME, "lastName").send_keys("User")
        self.driver.find_element(By.ID, "email").send_keys("user272@synthetic.taskflow.local")
        self.driver.find_element(By.ID, "password").send_keys("SomePassword123!")
        self.driver.find_element(By.ID, "confirmPassword").send_keys("SomePassword123!")

        submit_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Create account')]")
        submit_btn.click()

        # Wait for API 409 conflict alert
        alert = self.wait.until(EC.visibility_of_element_located((By.XPATH, "//*[@role='alert']")))
        self.assertIn("already registered", alert.text.lower())
        self.capture_screenshot("03_existing_email_rejected")
        print(f"[PASS] Case 3: Existing email registration rejected: '{alert.text}'")

    # -------------------------------------------------------------
    # 2 & 3. Register New User & Verify Navigation to OTP Page
    # -------------------------------------------------------------
    def test_04_register_new_user_and_navigate_to_otp(self):
        """Case 2 & 3: Register a new user and verify navigation to OTP page."""
        self.driver.get(f"{BASE_URL}/register")
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "form")))

        self.driver.find_element(By.NAME, "firstName").clear()
        self.driver.find_element(By.NAME, "firstName").send_keys(TEST_USER["firstName"])
        self.driver.find_element(By.NAME, "lastName").clear()
        self.driver.find_element(By.NAME, "lastName").send_keys(TEST_USER["lastName"])
        self.driver.find_element(By.ID, "email").clear()
        self.driver.find_element(By.ID, "email").send_keys(TEST_USER["email"])
        self.driver.find_element(By.ID, "phone").clear()
        self.driver.find_element(By.ID, "phone").send_keys(TEST_USER["phone"])
        self.driver.find_element(By.ID, "password").clear()
        self.driver.find_element(By.ID, "password").send_keys(TEST_USER["password"])
        self.driver.find_element(By.ID, "confirmPassword").clear()
        self.driver.find_element(By.ID, "confirmPassword").send_keys(TEST_USER["password"])

        self.capture_screenshot("04_registration_filled")
        submit_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Create account')]")
        submit_btn.click()

        # Verify automatic navigation to /verify-otp
        self.wait.until(EC.url_contains("/verify-otp"))
        self.assertIn("/verify-otp", self.driver.current_url)
        self.capture_screenshot("04_navigated_to_otp")
        print(f"[PASS] Case 2 & 3: Registered new user and navigated to: {self.driver.current_url}")

    # -------------------------------------------------------------
    # 4. Verify Displayed Email Address on OTP Page
    # -------------------------------------------------------------
    def test_05_verify_displayed_email_address(self):
        """Case 4: Verify the displayed email address on the OTP verification page."""
        self.wait.until(EC.presence_of_element_located((By.XPATH, "//h1[contains(text(), 'Verify your email')]")))

        # Check displayed email
        email_elem = self.wait.until(EC.visibility_of_element_located((By.XPATH, f"//strong[contains(text(), '{TEST_USER['email']}')]")))
        self.assertIsNotNone(email_elem)
        self.assertEqual(email_elem.text.strip(), TEST_USER["email"])
        self.capture_screenshot("05_displayed_email_verified")
        print(f"[PASS] Case 4: Verified displayed email: {email_elem.text}")

    # -------------------------------------------------------------
    # 5. Enter Incorrect OTP and Verify Error Handling
    # -------------------------------------------------------------
    def test_06_enter_incorrect_otp_error_handling(self):
        """Case 5: Enter incorrect OTP and verify error message and attempts remaining."""
        # Find 6 digit inputs
        digit_inputs = self.driver.find_elements(By.XPATH, "//input[@aria-label and contains(@aria-label, 'Digit')]")
        self.assertEqual(len(digit_inputs), 6)

        # Enter wrong code "000000"
        for i, inp in enumerate(digit_inputs):
            inp.send_keys("0")

        self.capture_screenshot("06_incorrect_otp_entered")
        verify_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Verify and complete registration')]")
        self.wait.until(EC.element_to_be_clickable(verify_btn))
        verify_btn.click()

        # Wait for error alert to appear
        error_alert = self.wait.until(EC.visibility_of_element_located((By.XPATH, "//*[@role='alert']")))
        self.assertIn("Invalid verification code", error_alert.text)
        self.assertIn("attempts remaining", error_alert.text.lower())
        self.capture_screenshot("06_incorrect_otp_error_displayed")
        print(f"[PASS] Case 5: Incorrect OTP rejected with message: '{error_alert.text}'")

    # -------------------------------------------------------------
    # 6. Test OTP Resend Functionality & Cooldown
    # -------------------------------------------------------------
    def test_07_test_otp_resend_cooldown(self):
        """Case 6: Test OTP resend countdown cooldown indicator."""
        # Resend button should reflect active cooldown
        resend_btn = self.wait.until(EC.presence_of_element_located((By.XPATH, "//button[contains(., 'Resend')]")))
        btn_text = resend_btn.text
        self.assertTrue(
            "resend in" in btn_text.lower() or "resend code" in btn_text.lower(),
            f"Unexpected resend button text: {btn_text}"
        )
        self.capture_screenshot("07_resend_cooldown_indicator")
        print(f"[PASS] Case 6: Resend button state verified: '{btn_text}'")

    # -------------------------------------------------------------
    # 7 & 8. Successful OTP Submission & Redirection to Login
    # -------------------------------------------------------------
    def test_08_successful_otp_submission_and_redirect(self):
        """Case 7 & 8: Retrieve valid test OTP, submit verification, and verify redirect to login."""
        # Retrieve valid OTP from database using test helper
        valid_otp = retrieve_test_otp(TEST_USER["email"])
        self.assertEqual(len(valid_otp), 6)
        print(f"Retrieved controlled test OTP: {valid_otp}")

        # Find 6 digit inputs
        digit_inputs = self.driver.find_elements(By.XPATH, "//input[@aria-label and contains(@aria-label, 'Digit')]")

        # Clear inputs using backspace and enter valid OTP
        for i, inp in enumerate(digit_inputs):
            inp.send_keys(Keys.BACK_SPACE)
            inp.send_keys(valid_otp[i])

        self.capture_screenshot("08_valid_otp_entered")
        verify_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Verify and complete registration')]")
        self.wait.until(EC.element_to_be_clickable(verify_btn))
        verify_btn.click()

        # Verify confirmation alert appears or wait for redirect
        try:
            success_alert = self.wait.until(EC.visibility_of_element_located((By.XPATH, "//*[@role='alert'] | //*[contains(text(), 'verified successfully')]")))
            alert_text = success_alert.text
            print(f"[PASS] Case 7: Verification confirmed: '{alert_text}'")
        except Exception:
            # Page may already be redirecting
            print("[PASS] Case 7: Verification succeeded, redirect in progress")

        self.capture_screenshot("08_otp_success_confirmation")

        # Verify automatic redirection to /login
        self.wait.until(EC.url_contains("/login"))
        self.assertIn("/login", self.driver.current_url)
        self.capture_screenshot("08_redirected_to_login")
        print(f"[PASS] Case 8: Redirection to login verified: {self.driver.current_url}")

    # -------------------------------------------------------------
    # 9. Log in Using Verified Account
    # -------------------------------------------------------------
    def test_09_login_using_verified_account(self):
        """Case 9: Log in using the newly verified account credentials."""
        self.wait_for_login_card_settled()

        email_input = self.driver.find_element(By.ID, "email")
        password_input = self.driver.find_element(By.ID, "password")

        email_input.clear()
        email_input.send_keys(TEST_USER["email"])
        password_input.clear()
        password_input.send_keys(TEST_USER["password"])

        self.capture_screenshot("09_login_credentials_entered")
        submit_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Sign in')]")
        submit_btn.click()

        # First-time login should route to /onboarding
        self.wait.until(EC.url_contains("/onboarding"))
        self.assertIn("/onboarding", self.driver.current_url)
        self.capture_screenshot("09_login_success_onboarding_route")
        print(f"[PASS] Case 9: Logged in and routed to: {self.driver.current_url}")

    # -------------------------------------------------------------
    # 10. Verify First-Time Onboarding
    # -------------------------------------------------------------
    def test_10_verify_first_time_onboarding(self):
        """Case 10: Verify first-time onboarding interface loaded with welcome card."""
        self.wait.until(EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Welcome to TaskFlow!')]")))
        first_steps = self.driver.find_element(By.XPATH, "//*[contains(text(), 'First steps')]")
        self.assertIsNotNone(first_steps)

        # Check setup steps list
        step_items = self.driver.find_elements(By.XPATH, "//ol/li")
        self.assertGreaterEqual(len(step_items), 3)

        self.capture_screenshot("10_first_time_onboarding_screen")
        print(f"[PASS] Case 10: First-time onboarding verified with {len(step_items)} setup steps")

    # -------------------------------------------------------------
    # 11 & 12. Complete Onboarding & Verify Dashboard Access
    # -------------------------------------------------------------
    def test_11_complete_onboarding_and_verify_dashboard(self):
        """Case 11 & 12: Complete onboarding and verify dashboard access."""
        dashboard_btn = self.wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Go to Dashboard')]")))
        dashboard_btn.click()

        # Wait for navigation to / and presence of main layout / dashboard metrics
        self.wait.until(lambda d: d.current_url.rstrip("/") in (BASE_URL, f"{BASE_URL}/") or "/dashboard" in d.current_url)
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "main")))

        self.capture_screenshot("11_dashboard_accessed")
        print(f"[PASS] Case 11 & 12: Onboarding completed and dashboard accessed: {self.driver.current_url}")

    # -------------------------------------------------------------
    # 13. Log Out
    # -------------------------------------------------------------
    def test_12_logout_flow(self):
        """Case 13: Log out and verify redirection back to /login."""
        logout_btn = self.wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Logout') or @title='Logout']")))
        logout_btn.click()

        # Verify redirect to login
        self.wait.until(EC.url_contains("/login"))
        self.assertIn("/login", self.driver.current_url)
        self.capture_screenshot("12_logged_out_to_login")
        print(f"[PASS] Case 13: Logged out and redirected to: {self.driver.current_url}")

    # -------------------------------------------------------------
    # 14 & 15. Log In Again & Verify Returning-User Dashboard Access
    # -------------------------------------------------------------
    def test_13_returning_user_login_and_dashboard_access(self):
        """Case 14 & 15: Log in again and verify returning user lands directly on dashboard."""
        self.wait_for_login_card_settled()

        email_input = self.driver.find_element(By.ID, "email")
        password_input = self.driver.find_element(By.ID, "password")

        email_input.clear()
        email_input.send_keys(TEST_USER["email"])
        password_input.clear()
        password_input.send_keys(TEST_USER["password"])

        submit_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Sign in')]")
        submit_btn.click()

        # Returning user MUST land directly on dashboard (NOT /onboarding)
        self.wait.until(lambda d: d.current_url.rstrip("/") in (BASE_URL, f"{BASE_URL}/") or "/dashboard" in d.current_url)
        self.assertNotIn("/onboarding", self.driver.current_url)
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "main")))

        self.capture_screenshot("13_returning_user_dashboard")
        print(f"[PASS] Case 14 & 15: Returning user directly accessed dashboard: {self.driver.current_url}")

    # -------------------------------------------------------------
    # Additional: Invalid Login Credentials
    # -------------------------------------------------------------
    def test_14_invalid_login_credentials(self):
        """Additional: Test invalid login credentials error handling."""
        self.driver.get(f"{BASE_URL}/login")
        self.wait_for_login_card_settled()

        self.driver.find_element(By.ID, "email").clear()
        self.driver.find_element(By.ID, "email").send_keys(TEST_USER["email"])
        self.driver.find_element(By.ID, "password").clear()
        self.driver.find_element(By.ID, "password").send_keys("WrongPasswordXYZ123!")

        submit_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Sign in')]")
        submit_btn.click()

        alert = self.wait.until(EC.visibility_of_element_located((By.XPATH, "//*[@role='alert']")))
        self.assertIsNotNone(alert)
        self.capture_screenshot("14_invalid_login_alert")
        print(f"[PASS] Additional: Invalid login credentials rejected: '{alert.text}'")

    # -------------------------------------------------------------
    # Additional: Protected Route Guard
    # -------------------------------------------------------------
    def test_15_protected_route_guard_unauthenticated(self):
        """Additional: Direct navigation to protected page without token redirects to /login."""
        # Clear storage
        self.driver.execute_script("localStorage.clear(); sessionStorage.clear();")
        self.driver.get(f"{BASE_URL}/workspaces")

        self.wait.until(EC.url_contains("/login"))
        self.assertIn("/login", self.driver.current_url)
        self.capture_screenshot("15_unauthenticated_protected_route_guard")
        print(f"[PASS] Additional: Protected route redirected to: {self.driver.current_url}")

    # -------------------------------------------------------------
    # Additional: Desktop & Mobile Viewport Layout Verification
    # -------------------------------------------------------------
    def test_16_desktop_and_mobile_viewports(self):
        """Additional: Verify layout responsiveness on Desktop (1440x900) and Mobile (390x844)."""
        # Desktop
        self.driver.set_window_size(1440, 900)
        self.driver.get(f"{BASE_URL}/verify-otp?email={TEST_USER['email']}")
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "main")))
        self.capture_screenshot("16_desktop_verify_otp_1440x900")

        # Mobile
        self.driver.set_window_size(390, 844)
        self.driver.get(f"{BASE_URL}/verify-otp?email={TEST_USER['email']}")
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "main")))
        self.capture_screenshot("16_mobile_verify_otp_390x844")
        print("[PASS] Additional: Desktop and Mobile viewports captured")

    # -------------------------------------------------------------
    # Additional: Browser Console Errors Inspection
    # -------------------------------------------------------------
    def test_17_browser_console_errors(self):
        """Additional: Check for SEVERE browser console errors across the session."""
        logs = self.driver.get_log("browser")
        severe_errors = [log for log in logs if log.get("level") == "SEVERE" and "favicon" not in log.get("message", "").lower()]
        
        # Filter out expected 4xx errors deliberately triggered during negative test cases (409 conflict, 400 bad OTP, 401 bad password)
        expected_fragments = ["409", "400", "401", "Registration failed:", "OTP verification error:", "Login failed:"]
        unexpected_errors = [
            err for err in severe_errors
            if not any(frag in err.get("message", "") for frag in expected_fragments)
        ]

        print(f"[INFO] Total console logs: {len(logs)}, Severe (expected negative tests): {len(severe_errors)}, Unexpected: {len(unexpected_errors)}")
        for err in unexpected_errors:
            print(f"  [UNEXPECTED CONSOLE ERROR] {err.get('message')}")

        self.assertEqual(len(unexpected_errors), 0, f"Found unexpected console errors: {unexpected_errors}")
        print("[PASS] Additional: Browser console clean without unexpected errors")


if __name__ == "__main__":
    unittest.main()
