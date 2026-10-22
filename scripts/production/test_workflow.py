from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "build-production.yml"


class ProductionWorkflowTest(unittest.TestCase):
    def test_workflow_pins_actions_and_keeps_release_available_for_promotion(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        for mutable in (
            "actions/checkout@v",
            "actions/setup-node@v",
            "oven-sh/setup-bun@v",
            "actions/upload-artifact@v",
            "actions/download-artifact@v",
        ):
            self.assertNotIn(mutable, workflow)
        self.assertIn("--build-arg VITE_APP_MODE=production", workflow)
        self.assertIn("retention-days: 14", workflow)

    def test_pull_requests_build_every_production_image_without_publishing(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("pr-images:", workflow)
        section = workflow.split("pr-images:", 1)[1].split("\n  build:", 1)[0]
        self.assertIn("github.event_name == 'pull_request'", section)
        self.assertIn("--target runtime", section)
        self.assertIn("--target migrate", section)
        self.assertIn("-f Dockerfile.frontend", section)
        self.assertNotIn("upload-artifact", section)
        self.assertNotIn("DEPLOY_", section)

    def test_production_frontend_uses_one_canonical_login_origin(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        pull_request_section = workflow.split("pr-images:", 1)[1].split("\n  build:", 1)[0]
        build_section = workflow.split("\n  build:", 1)[1].split("\n  release:", 1)[0]

        self.assertIn(
            "--build-arg VITE_TRIXUS_PLATFORM_APP_URL=https://app.ci.invalid",
            pull_request_section,
        )
        self.assertIn(
            "--build-arg VITE_TRIXUS_TENANT_APP_URL=https://app.ci.invalid",
            pull_request_section,
        )
        self.assertNotIn("chat.ci.invalid", pull_request_section)

        canonical = "https://app.trixus.com.br"
        self.assertIn(f"VITE_TRIXUS_PLATFORM_APP_URL: {canonical}", build_section)
        self.assertIn(f"VITE_TRIXUS_TENANT_APP_URL: {canonical}", build_section)
        self.assertNotIn("${{ vars.VITE_TRIXUS_PLATFORM_APP_URL }}", build_section)
        self.assertNotIn("${{ vars.VITE_TRIXUS_TENANT_APP_URL }}", build_section)
        self.assertIn(
            'test "$VITE_TRIXUS_PLATFORM_APP_URL" = "https://app.trixus.com.br"',
            build_section,
        )
        self.assertIn(
            'test "$VITE_TRIXUS_TENANT_APP_URL" = "https://app.trixus.com.br"',
            build_section,
        )
        self.assertIn(
            "VITE_TRIXUS_PLATFORM_APP_URL=https://app.trixus.com.br",
            build_section,
        )
        self.assertIn(
            "VITE_TRIXUS_TENANT_APP_URL=https://app.trixus.com.br",
            build_section,
        )


if __name__ == "__main__":
    unittest.main()
