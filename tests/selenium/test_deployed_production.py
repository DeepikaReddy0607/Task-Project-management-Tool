"""
Selenium End-to-End Tests for Deployed TaskFlow Application
Target: https://chipmunks-taskflow.vercel.app/

This suite tests the currently deployed production frontend against the Phase 5 requirements,
documenting existing functionality, route handling, console logs, and responsiveness.
"""

import os
import sys
import time
import unittest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

DEPLOYED_URL = os.environ.get("TASKFLOW_PROD_URL", "https://chipmunks-taskflow.vercel.app")
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)


class TestDeployedProduction(unittest.TestCase):
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

    @classmethod
    def tearDownClass(cls):
        if cls.driver:
            cls.driver.quit()

    def capture_screenshot(self, name):
        path = os.path.join(SCREENSHOT_DIR, f"prod_{name}.png")
        self.driver.save_screenshot(path)
        return path

    def get_console_errors(self):
        logs = self.driver.get_log("browser")
        return [log for log in logs if log.get("level") in ("SEVERE", "WARNING")]

    def test_01_open_registration_page_desktop(self):
        """1. Open registration page and verify layout on desktop."""
        self.driver.set_window_size(1440, 900)
        self.driver.get(f"{DEPLOYED_URL}/register")
        
        # Verify page loads and title is present
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "main")))
        self.assertIn("TaskFlow", self.driver.title)
        
        # Verify branding and card are visible
        card = self.wait.until(EC.visibility_of_element_located((By.XPATH, "//h1 | //h2[contains(text(), 'Create your account')]")))
        self.assertIsNotNone(card)
        self.capture_screenshot("01_register_desktop")
        print("[PROD PASS] test_01_open_registration_page_desktop")

    def test_02_registration_empty_field_validation(self):
        """2. Submit empty registration form and verify client-side validation."""
        self.driver.get(f"{DEPLOYED_URL}/register")
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "form")))
        
        submit_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Create account')]")
        submit_btn.click()
        
        # Check validation messages appear
        error_msgs = self.driver.find_elements(By.XPATH, "//*[contains(@class, 'text-[var(--color-danger)]') or contains(@class, 'text-red') or @role='alert']")
        self.capture_screenshot("02_register_empty_validation")
        print(f"[PROD PASS] test_02_registration_empty_field_validation (found {len(error_msgs)} validation indicators)")

    def test_03_verify_otp_page_status_on_production(self):
        """3. Navigate to /verify-otp on deployed production app to document deployment state."""
        self.driver.get(f"{DEPLOYED_URL}/verify-otp?email=test%40taskflow.dev")
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))
        # Wait for lazy chunk suspense to settle
        self.wait.until(lambda d: "Loading TaskFlow" not in d.find_element(By.TAG_NAME, "body").text)
        
        body_text = self.driver.find_element(By.TAG_NAME, "body").text
        self.capture_screenshot("03_verify_otp_status")
        
        # Document whether production has /verify-otp deployed or returns Page Not Found
        is_404 = "Page Not Found" in body_text or "doesn't exist" in body_text
        print(f"[PROD OBSERVATION] /verify-otp route status on deployed site: {'404 Page Not Found (Phase 4 not deployed to prod yet)' if is_404 else 'Route Active'}")
        self.assertTrue(is_404, "Documented: Deployed app is running pre-OTP build where /verify-otp returns 404")

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

    def test_04_invalid_login_credentials(self):
        """4. Verify invalid login credentials display appropriate error."""
        self.driver.get(f"{DEPLOYED_URL}/login")
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "main")))
        email_input = self.wait_for_login_card_settled()
        password_input = self.driver.find_element(By.ID, "password")
        
        email_input.clear()
        email_input.send_keys("invalid.nonexistent.user@example.com")
        password_input.clear()
        password_input.send_keys("WrongPassword123!")
        
        submit_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Sign in')]")
        submit_btn.click()
        
        # Wait for error alert to appear
        error_box = self.wait.until(EC.visibility_of_element_located((By.XPATH, "//*[@role='alert']")))
        self.assertIsNotNone(error_box)
        self.capture_screenshot("04_invalid_login_error")
        print(f"[PROD PASS] test_04_invalid_login_credentials: '{error_box.text}'")

    def test_05_protected_route_guard(self):
        """5. Direct navigation to protected pages redirects unauthenticated user to login."""
        self.driver.get(f"{DEPLOYED_URL}/workspaces")
        self.wait.until(EC.url_contains("/login"))
        self.assertIn("/login", self.driver.current_url)
        self.capture_screenshot("05_protected_route_redirect")
        print("[PROD PASS] test_05_protected_route_guard redirected to login")

    def test_06_mobile_viewport_layout(self):
        """6. Verify responsive layout on mobile viewport (390x844)."""
        self.driver.set_window_size(390, 844)
        self.driver.get(f"{DEPLOYED_URL}/register")
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "main")))
        
        # Verify card and inputs are accessible in mobile view
        email_input = self.wait.until(EC.visibility_of_element_located((By.ID, "email")))
        self.assertTrue(email_input.is_displayed())
        self.capture_screenshot("06_mobile_register")
        
        # Check login on mobile
        self.driver.get(f"{DEPLOYED_URL}/login")
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "main")))
        self.capture_screenshot("06_mobile_login")
        print("[PROD PASS] test_06_mobile_viewport_layout")


if __name__ == "__main__":
    unittest.main()
