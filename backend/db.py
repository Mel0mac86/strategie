"""Accesso dati con fallback in-memory.

Se MONGO_URL è raggiungibile usa MongoDB (motor). Altrimenti, per permettere
lo sviluppo/anteprima senza database, usa uno store in-memory volatile.
"""
from __future__ import annotations

import os
from typing import Any, Optional


class _MemoryCollection:
    def __init__(self) -> None:
        self._docs: list[dict] = []

    async def insert_one(self, doc: dict):
        self._docs.append(dict(doc))
        return type("R", (), {"inserted_id": doc.get("id")})

    async def find_one(self, query: dict) -> Optional[dict]:
        for d in self._docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None

    def find(self, query: dict | None = None):
        query = query or {}
        matched = [dict(d) for d in self._docs
                   if all(d.get(k) == v for k, v in query.items())]
        return _MemoryCursor(matched)

    async def update_one(self, query: dict, update: dict, upsert: bool = False):
        setter = update.get("$set", {})
        for d in self._docs:
            if all(d.get(k) == v for k, v in query.items()):
                d.update(setter)
                return type("R", (), {"matched_count": 1})
        if upsert:
            doc = {**query, **setter}
            self._docs.append(doc)
        return type("R", (), {"matched_count": 0})

    async def update_many(self, query: dict, update: dict):
        setter = update.get("$set", {})
        n = 0
        for d in self._docs:
            if all(d.get(k) == v for k, v in query.items()):
                d.update(setter)
                n += 1
        return type("R", (), {"modified_count": n})

    async def delete_one(self, query: dict):
        for i, d in enumerate(self._docs):
            if all(d.get(k) == v for k, v in query.items()):
                self._docs.pop(i)
                return type("R", (), {"deleted_count": 1})
        return type("R", (), {"deleted_count": 0})


class _MemoryCursor:
    def __init__(self, docs: list[dict]):
        self._docs = docs
        self._sort: tuple[str, int] | None = None

    def sort(self, key: str, direction: int = 1):
        self._sort = (key, direction)
        return self

    async def to_list(self, length: int | None = None):
        docs = self._docs
        if self._sort:
            key, direction = self._sort
            docs = sorted(docs, key=lambda d: d.get(key) or 0,
                          reverse=(direction < 0))
        return docs[:length] if length else docs


class _MemoryDB:
    def __init__(self) -> None:
        self._cols: dict[str, _MemoryCollection] = {}

    def __getitem__(self, name: str) -> _MemoryCollection:
        return self._cols.setdefault(name, _MemoryCollection())


class Database:
    """Wrapper che espone .db (mongo o memory)."""

    def __init__(self) -> None:
        self.client: Any = None
        self.db: Any = None
        self.using_memory = True

    async def connect(self) -> None:
        mongo_url = os.getenv("MONGO_URL")
        db_name = os.getenv("DB_NAME", "ftmo_app")
        if not mongo_url:
            self._fallback("MONGO_URL non impostato")
            return
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=2000)
            await client.admin.command("ping")
            self.client = client
            self.db = client[db_name]
            self.using_memory = False
            print(f"[db] Connesso a MongoDB ({db_name})")
        except Exception as exc:  # noqa: BLE001
            self._fallback(f"MongoDB non raggiungibile: {exc}")

    def _fallback(self, reason: str) -> None:
        print(f"[db] Fallback store in-memory ({reason})")
        self.db = _MemoryDB()
        self.using_memory = True

    async def close(self) -> None:
        if self.client:
            self.client.close()


database = Database()
