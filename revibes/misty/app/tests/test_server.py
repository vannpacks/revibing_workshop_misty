"""Backend contracts; no paid calls and no running bridge required."""
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from prompts import blending_messages, refinement_messages


def response(value):
    return io.BytesIO(json.dumps(value).encode())


class ModelContracts(unittest.TestCase):
    def test_multimodal_global_preserves_source_and_image(self):
        data = {"code": "() => <main>Fuji</main>", "image": "data:image/png;base64,eA==", "mode": "global"}
        server.validate(data, "blend")
        messages = blending_messages(data)
        self.assertIn(data["code"], messages[1]["content"][0]["text"])
        self.assertEqual(messages[1]["content"][1]["image_url"]["url"], data["image"])
        self.assertIn("Preserve all source UI content", messages[1]["content"][0]["text"])

    def test_localized_requires_aspects_target_and_custom_description(self):
        data = {"code": "() => <div/>", "image": "data:image/png;base64,eA==", "mode": "localized", "aspects": ["Customize"], "target": "<section>Interests</section>"}
        with self.assertRaises(server.RequestError):
            server.validate(data, "blend")
        data["custom"] = "Borrow the spacing"
        server.validate(data, "blend")
        prompt = blending_messages(data)[1]["content"][0]["text"]
        self.assertIn(data["target"], prompt)
        self.assertIn(data["custom"], prompt)
        data["target"] = ""
        with self.assertRaises(server.RequestError):
            server.validate(data, "blend")

    def test_wrong_backend_rejected_without_generation(self):
        with patch.object(server.urllib.request, "urlopen", return_value=response({"ok": True, "backend": "claude"})) as call:
            with self.assertRaisesRegex(server.RequestError, "another backend"):
                server.call_model([])
            self.assertEqual(call.call_count, 1)

    def test_codex_response_normalization_and_json_request(self):
        result = {"updatedCode": "```jsx\n() => <div>Fuji</div>\n```", "categorizedChanges": [{"category": "Color: Dark theme", "changes": [{"type": "color", "before": "bg-white", "after": "bg-black"}]}]}
        bridge = {"choices": [{"message": {"content": "```json\n" + json.dumps(result) + "\n```"}}]}
        with patch.object(server.urllib.request, "urlopen", side_effect=[response({"ok": True, "backend": "codex", "model": "test-model"}), response(bridge)]) as call:
            actual = server.call_model([{"role": "user", "content": "test"}])
            self.assertEqual(actual["updatedCode"], "() => <div>Fuji</div>")
            self.assertTrue(actual["categorizedChanges"][0]["enabled"])
            self.assertEqual(actual["model"], "test-model")
            request = call.call_args_list[1].args[0]
            self.assertEqual(json.loads(request.data)["response_format"], {"type": "json_object"})

    def test_malformed_response_does_not_become_empty_source(self):
        for content in ["not JSON", '{}', '{"updatedCode":""}', '[]']:
            with self.subTest(content=content), self.assertRaises(server.RequestError):
                server.normalize_result(content)

    def test_refinement_carries_original_blend_current_code_and_group_state(self):
        data = {"code": "current manual edit", "originalCode": "original", "blendedCode": "blended", "groups": [{"category": "Color", "enabled": False, "changes": []}]}
        server.validate(data, "refine")
        prompt = refinement_messages(data)[1]["content"]
        for value in ["original", "blended", "current manual edit", '"enabled": false']:
            self.assertIn(value, prompt)


if __name__ == "__main__":
    unittest.main()
