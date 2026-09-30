import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from app import app


HTTPX_ASYNC_CLIENT = httpx.AsyncClient


class BookstoreApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "bookstore-test.sqlite3"
        self.database_patch = patch("app.DATABASE_PATH", self.database_path)
        self.database_patch.start()
        self.client = HTTPX_ASYNC_CLIENT(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        )

    async def asyncTearDown(self):
        await self.client.aclose()
        self.database_patch.stop()
        self.temp_dir.cleanup()

    async def test_homepage_and_book_catalog_filters(self):
        home = await self.client.get("/")
        cart_page = await self.client.get("/cart")
        checkout_page = await self.client.get("/checkout")
        all_books = await self.client.get("/api/books")
        search = await self.client.get("/api/books", params={"q": "astronaut", "sort": "price-asc"})

        self.assertEqual(home.status_code, 200)
        self.assertIn("KK Book Store", home.text)
        self.assertIn("AiAssistant", home.text)
        self.assertIn('id="assistant-model"', home.text)
        self.assertEqual(cart_page.status_code, 200)
        self.assertIn('id="cart-page"', cart_page.text)
        self.assertEqual(checkout_page.status_code, 200)
        self.assertIn('id="checkout-page"', checkout_page.text)
        self.assertEqual(len(all_books.json()["books"]), 17)
        self.assertTrue(all_books.json()["categories"])
        self.assertEqual([book["title"] for book in search.json()["books"]], ["Project Hail Mary"])

    async def test_order_uses_server_catalog_price_and_rejects_unknown_book(self):
        order = await self.client.post("/api/orders", json={
            "name": "Reader Name",
            "email": "reader@example.com",
            "address": "123 Book Lane",
            "city": "Portland",
            "postal_code": "97201",
            "items": [{"book_id": "atomic-habits", "quantity": 3}],
        })
        unknown = await self.client.post("/api/orders", json={
            "name": "Reader Name",
            "email": "reader@example.com",
            "address": "123 Book Lane",
            "city": "Portland",
            "postal_code": "97201",
            "items": [{"book_id": "not-a-real-book", "quantity": 1}],
        })
        invalid_email = await self.client.post("/api/orders", json={
            "name": "Reader Name",
            "email": "not-an-email",
            "address": "123 Book Lane",
            "city": "Portland",
            "postal_code": "97201",
            "items": [{"book_id": "atomic-habits", "quantity": 1}],
        })

        self.assertEqual(order.status_code, 201)
        self.assertEqual(order.json()["subtotal"], 54.0)
        self.assertEqual(order.json()["shipping"], 0)
        self.assertEqual(order.json()["total"], 54.0)
        self.assertEqual(unknown.status_code, 400)
        self.assertEqual(invalid_email.status_code, 422)

    async def test_newsletter_subscription_is_validated_and_idempotent(self):
        first = await self.client.post("/api/newsletter", json={"email": " Reader@Example.com "})
        second = await self.client.post("/api/newsletter", json={"email": "reader@example.com"})
        invalid = await self.client.post("/api/newsletter", json={"email": "nope"})

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(invalid.status_code, 422)

    async def test_local_model_discovery_and_streaming(self):
        requests = []
        ollama_output = (
            b'{"message":{"role":"assistant","content":"Read "},"done":false}\n'
            b'{"message":{"role":"assistant","content":"Project Hail Mary."},"done":true}\n'
        )

        def ollama_handler(request):
            requests.append(request)
            if request.url.path.endswith("/api/tags"):
                return httpx.Response(200, json={"models": [{"name": "gemma3:4b"}, {"name": "llama3.2:3b"}]})
            return httpx.Response(200, content=ollama_output)

        def mock_client(*args, **kwargs):
            return HTTPX_ASYNC_CLIENT(transport=httpx.MockTransport(ollama_handler), **kwargs)

        with patch("app.httpx.AsyncClient", new=mock_client):
            available = await self.client.get("/api/local/models")
            response = await self.client.post("/api/assistant", json={
                "messages": [{"role": "user", "content": "Recommend a science-fiction book."}],
                "model": "gemma3:4b",
            })

        self.assertEqual(available.json()["models"], ["gemma3:4b", "llama3.2:3b"])
        self.assertEqual(available.json()["default"], "llama3.2:3b")
        self.assertEqual(response.status_code, 200)
        self.assertIn('"content": "Read "', response.text)
        self.assertIn('"type": "done"', response.text)
        payload = json.loads(requests[-1].content)
        self.assertEqual(payload["model"], "gemma3:4b")
        self.assertTrue(any("Project Hail Mary" in message["content"] for message in payload["messages"] if message["role"] == "system"))


if __name__ == "__main__":
    unittest.main()
