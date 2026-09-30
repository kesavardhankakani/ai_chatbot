import json
import os
import re
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
load_dotenv(BASE_DIR / ".env")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
DATABASE_PATH = Path(os.getenv("BOOKSTORE_DATABASE", str(BASE_DIR / "data" / "bookstore.sqlite3")))

BOOKS = [
	{"id": "atomic-habits", "title": "Atomic Habits", "author": "James Clear", "category": "Personal Growth", "price": 18.00, "rating": 4.8, "reviews": 2418, "badge": "Bestseller", "isbn": "9780735211292", "description": "A practical guide to building good habits, breaking bad ones, and making small changes that compound into remarkable results."},
	{"id": "educated", "title": "Educated", "author": "Tara Westover", "category": "Memoir", "price": 16.50, "rating": 4.7, "reviews": 1842, "badge": "Staff pick", "isbn": "9780399590504", "description": "A moving memoir about a young woman who leaves her survivalist family and discovers the transformative power of education."},
	{"id": "project-hail-mary", "title": "Project Hail Mary", "author": "Andy Weir", "category": "Science Fiction", "price": 19.00, "rating": 4.9, "reviews": 3051, "badge": "Reader favorite", "isbn": "9780593135204", "description": "A lone astronaut wakes up light-years from home with a desperate mission and an unexpected friendship to save humanity."},
	{"id": "sapiens", "title": "Sapiens", "author": "Yuval Noah Harari", "category": "Nonfiction", "price": 21.00, "rating": 4.6, "reviews": 1677, "badge": "Book club", "isbn": "9780062316097", "description": "An ambitious exploration of how Homo sapiens came to shape the world, from the cognitive revolution to the present."},
	{"id": "the-creative-act", "title": "The Creative Act", "author": "Rick Rubin", "category": "Art & Creativity", "price": 24.00, "rating": 4.7, "reviews": 932, "badge": "New perspective", "isbn": "9780593652886", "description": "Legendary music producer Rick Rubin shares a generous, meditative guide to creativity as a way of being in the world."},
	{"id": "tomorrow", "title": "Tomorrow, and Tomorrow, and Tomorrow", "author": "Gabrielle Zevin", "category": "Fiction", "price": 17.00, "rating": 4.5, "reviews": 1384, "badge": "Staff pick", "isbn": "9780593321201", "description": "A luminous novel about friendship, art, love, and the worlds people build together through games."},
	{"id": "fourth-wing", "title": "Fourth Wing", "author": "Rebecca Yarros", "category": "Fantasy", "price": 18.50, "rating": 4.6, "reviews": 2273, "badge": "Bestseller", "isbn": "9781649374042", "description": "A dragon-rider cadet fights for survival, ambition, and belonging at a dangerous war college."},
	{"id": "design-everyday", "title": "The Design of Everyday Things", "author": "Don Norman", "category": "Design", "price": 20.00, "rating": 4.7, "reviews": 811, "badge": "Essential read", "isbn": "9780465050659", "description": "A foundational, approachable look at how thoughtful design makes everyday objects intuitive and easier to use."},
	{"id": "alchemist", "title": "The Alchemist", "author": "Paulo Coelho", "category": "Fiction", "price": 15.00, "rating": 4.5, "reviews": 2921, "badge": "A modern classic", "isbn": "9780062315007", "description": "A shepherd's journey across the desert becomes a timeless fable about listening to your heart and pursuing a dream."},
	{"id": "braiding-sweetgrass", "title": "Braiding Sweetgrass", "author": "Robin Wall Kimmerer", "category": "Nature", "price": 18.00, "rating": 4.8, "reviews": 1207, "badge": "Beloved", "isbn": "9781571313560", "description": "A botanist and member of the Citizen Potawatomi Nation blends science and Indigenous wisdom into a vision of reciprocity with the living world."},
	{"id": "the-hobbit", "title": "The Hobbit", "author": "J.R.R. Tolkien", "category": "Fantasy", "price": 16.00, "rating": 4.8, "reviews": 2143, "badge": "A classic", "isbn": "9780547928227", "description": "A comfort-loving hobbit joins a company of dwarves on an unexpected journey to reclaim their mountain home."},
	{"id": "dune", "title": "Dune", "author": "Frank Herbert", "category": "Science Fiction", "price": 18.00, "rating": 4.7, "reviews": 1981, "badge": "Worlds within worlds", "isbn": "9780441172719", "description": "On the desert planet Arrakis, a young heir is drawn into a struggle over power, ecology, and the most precious resource in the universe."},
	{"id": "piranesi", "title": "Piranesi", "author": "Susanna Clarke", "category": "Fiction", "price": 15.50, "rating": 4.6, "reviews": 1098, "badge": "A strange delight", "isbn": "9781635575637", "description": "A solitary narrator makes a life among endless halls and tides, until the world he knows begins to reveal its secrets."},
	{"id": "deep-work", "title": "Deep Work", "author": "Cal Newport", "category": "Personal Growth", "price": 17.00, "rating": 4.5, "reviews": 1362, "badge": "Focus, reclaimed", "isbn": "9781455586691", "description": "A practical case for focused, distraction-free work and a set of habits for making room for meaningful concentration."},
	{"id": "thinking-fast-slow", "title": "Thinking, Fast and Slow", "author": "Daniel Kahneman", "category": "Nonfiction", "price": 19.50, "rating": 4.6, "reviews": 1548, "badge": "Mind at work", "isbn": "9780374533557", "description": "A landmark exploration of the two modes of thought that shape our judgments, decisions, and everyday lives."},
	{"id": "thursday-murder-club", "title": "The Thursday Murder Club", "author": "Richard Osman", "category": "Mystery", "price": 16.50, "rating": 4.5, "reviews": 1286, "badge": "A clever mystery", "isbn": "9781984880987", "description": "Four unlikely friends in a retirement village turn their weekly cold-case meetings toward a very current murder."},
	{"id": "never-let-me-go", "title": "Never Let Me Go", "author": "Kazuo Ishiguro", "category": "Fiction", "price": 16.00, "rating": 4.6, "reviews": 1153, "badge": "Quietly unforgettable", "isbn": "9781400078776", "description": "A tender, unsettling story of friendship, memory, and the truths that shape a seemingly sheltered school."},
]
BOOK_BY_ID = {book["id"]: book for book in BOOKS}

app = FastAPI(title="KK Book Store", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class OrderItem(BaseModel):
	book_id: str = Field(min_length=1, max_length=80)
	quantity: int = Field(ge=1, le=20)


class CheckoutRequest(BaseModel):
	name: str = Field(min_length=2, max_length=120)
	email: str = Field(min_length=5, max_length=254)
	address: str = Field(min_length=5, max_length=240)
	city: str = Field(min_length=2, max_length=100)
	postal_code: str = Field(min_length=3, max_length=20)
	items: list[OrderItem] = Field(min_length=1, max_length=25)

	@field_validator("email")
	@classmethod
	def validate_email(cls, value: str) -> str:
		value = value.strip().lower()
		if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
			raise ValueError("Enter a valid email address.")
		return value


class NewsletterRequest(BaseModel):
	email: str = Field(min_length=5, max_length=254)

	@field_validator("email")
	@classmethod
	def validate_email(cls, value: str) -> str:
		value = value.strip().lower()
		if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
			raise ValueError("Enter a valid email address.")
		return value


class AssistantMessage(BaseModel):
	role: Literal["user", "assistant"]
	content: str = Field(min_length=1, max_length=8_000)


class AssistantRequest(BaseModel):
	messages: list[AssistantMessage] = Field(min_length=1, max_length=24)
	model: str = Field(default="", max_length=120)


@app.middleware("http")
async def add_security_headers(request, call_next):
	response = await call_next(request)
	response.headers["X-Content-Type-Options"] = "nosniff"
	response.headers["X-Frame-Options"] = "DENY"
	response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
	return response


@app.get("/", include_in_schema=False)
async def index():
	return FileResponse(STATIC_DIR / "index.html")


@app.get("/cart", include_in_schema=False)
@app.get("/checkout", include_in_schema=False)
async def commerce_pages():
	return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/books")
async def books(
	q: str = Query(default="", max_length=120),
	category: str = Query(default="", max_length=80),
	sort: Literal["featured", "price-asc", "price-desc", "rating"] = "featured",
):
	search = q.strip().casefold()
	results = [
		book for book in BOOKS
		if (not category or book["category"] == category)
		and (not search or search in f"{book['title']} {book['author']} {book['category']} {book['description']}".casefold())
	]
	if sort == "price-asc":
		results.sort(key=lambda book: book["price"])
	elif sort == "price-desc":
		results.sort(key=lambda book: book["price"], reverse=True)
	elif sort == "rating":
		results.sort(key=lambda book: book["rating"], reverse=True)
	return {"books": results, "categories": sorted({book["category"] for book in BOOKS})}


def initialize_database():
	DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
	with closing(sqlite3.connect(DATABASE_PATH)) as connection:
		with connection:
			connection.execute("PRAGMA journal_mode=WAL")
			connection.execute(
				"""CREATE TABLE IF NOT EXISTS orders (
					id TEXT PRIMARY KEY,
					created_at TEXT NOT NULL,
					name TEXT NOT NULL,
					email TEXT NOT NULL,
					address TEXT NOT NULL,
					city TEXT NOT NULL,
					postal_code TEXT NOT NULL,
					items_json TEXT NOT NULL,
					subtotal REAL NOT NULL,
					shipping REAL NOT NULL,
					total REAL NOT NULL
				)"""
			)
			connection.execute(
				"CREATE TABLE IF NOT EXISTS newsletter_subscribers (email TEXT PRIMARY KEY, created_at TEXT NOT NULL)"
			)


@app.on_event("startup")
async def on_startup():
	initialize_database()


@app.post("/api/orders", status_code=201)
async def place_order(request: CheckoutRequest):
	initialize_database()
	order_lines = []
	for item in request.items:
		book = BOOK_BY_ID.get(item.book_id)
		if book is None:
			raise HTTPException(status_code=400, detail="One of the selected books is unavailable.")
		order_lines.append({
			"book_id": book["id"],
			"title": book["title"],
			"quantity": item.quantity,
			"unit_price": book["price"],
		})
	subtotal = round(sum(line["unit_price"] * line["quantity"] for line in order_lines), 2)
	shipping = 0 if subtotal >= 50 else 4.95
	total = round(subtotal + shipping, 2)
	order_id = uuid.uuid4().hex[:12].upper()
	created_at = datetime.now(timezone.utc).isoformat()
	with closing(sqlite3.connect(DATABASE_PATH)) as connection:
		with connection:
			connection.execute(
				"INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
				(
					order_id, created_at, request.name.strip(), request.email.strip().lower(),
					request.address.strip(), request.city.strip(), request.postal_code.strip(),
					json.dumps(order_lines), subtotal, shipping, total,
				),
			)
	return {"order_id": order_id, "created_at": created_at, "items": order_lines, "subtotal": subtotal, "shipping": shipping, "total": total}


@app.post("/api/newsletter", status_code=201)
async def subscribe_newsletter(request: NewsletterRequest):
	initialize_database()
	with closing(sqlite3.connect(DATABASE_PATH)) as connection:
		with connection:
			connection.execute(
				"INSERT OR IGNORE INTO newsletter_subscribers (email, created_at) VALUES (?, ?)",
				(request.email, datetime.now(timezone.utc).isoformat()),
			)
	return {"subscribed": True}


@app.get("/api/local/models")
async def local_models():
	try:
		async with httpx.AsyncClient(timeout=httpx.Timeout(4.0, connect=2.0)) as client:
			response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
			response.raise_for_status()
		models = [
			item["name"] for item in response.json().get("models", [])
			if isinstance(item, dict) and isinstance(item.get("name"), str)
		]
		default = OLLAMA_MODEL if OLLAMA_MODEL in models else next(
			(name for name in models if name.startswith("llama3.2:3b")),
			models[0] if models else "",
		)
		return {"available": True, "models": models, "default": default}
	except (httpx.HTTPError, ValueError):
		return JSONResponse(
			status_code=503,
			content={"available": False, "models": [], "default": "", "error": "Ollama is not reachable on this computer."},
		)


def sse(payload: dict[str, object]) -> str:
	return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def stream_assistant(request: AssistantRequest):
	model = request.model.strip() or OLLAMA_MODEL
	book_context = "\n".join(
		f"- {book['title']} by {book['author']} | {book['category']} | ${book['price']:.2f} | {book['description']}"
		for book in BOOKS
	)
	messages = [{
		"role": "system",
		"content": (
			"You are AiAssistant, a friendly bookshop guide for KK Book Store. "
			"Recommend books from this catalog and never invent availability or prices. "
			"Answer clearly and warmly. Catalog:\n" + book_context
		),
	}]
	messages.extend(message.model_dump() for message in request.messages)
	try:
		async with httpx.AsyncClient(timeout=httpx.Timeout(connect=4.0, read=None, write=30.0, pool=10.0)) as client:
			async with client.stream(
				"POST",
				f"{OLLAMA_BASE_URL}/api/chat",
				json={"model": model, "messages": messages, "stream": True, "options": {"num_predict": 180}},
			) as response:
				if response.is_error:
					body = (await response.aread()).decode("utf-8", errors="replace")
					try:
						detail = json.loads(body).get("error", body)
					except json.JSONDecodeError:
						detail = body
					yield sse({"type": "error", "message": str(detail)[:500]})
					return
				async for line in response.aiter_lines():
					if not line:
						continue
					try:
						chunk = json.loads(line)
					except json.JSONDecodeError:
						continue
					if chunk.get("error"):
						yield sse({"type": "error", "message": str(chunk["error"])[:500]})
						return
					content = chunk.get("message", {}).get("content", "")
					if content:
						yield sse({"type": "token", "content": content})
					if chunk.get("done"):
						yield sse({"type": "done"})
						return
				yield sse({"type": "done"})
	except httpx.TimeoutException:
		yield sse({"type": "error", "message": "The local model is taking too long. Try a smaller Ollama model."})
	except httpx.RequestError:
		yield sse({"type": "error", "message": "Ollama is not running. Start Ollama on this computer to chat offline."})


@app.post("/api/assistant")
async def assistant(request: AssistantRequest):
	return StreamingResponse(
		stream_assistant(request),
		media_type="text/event-stream",
		headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
	)


