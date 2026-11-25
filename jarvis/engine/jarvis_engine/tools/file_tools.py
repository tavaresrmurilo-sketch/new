"""File Intelligence tools. Writes are confined by security.check_write()."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from ..core import fmt
from ..core.text import normalize
from ..security import PathDenied, check_read, check_write, open_risk, safe_filename
from ..services.file_index import EXT_GROUPS, extract_text
from .base import PermissionLevel as L
from .base import Tool, ToolContext, ToolExecutionError, ToolParam, ToolResult, fail, ok, tool

FOLDER_ALIASES = {
    "downloads": "downloads", "download": "downloads", "baixados": "downloads",
    "documentos": "documents", "documents": "documents", "meus documentos": "documents",
    "area de trabalho": "desktop", "desktop": "desktop", "mesa": "desktop",
    "imagens": "pictures", "fotos": "pictures", "pictures": "pictures",
    "musicas": "music", "musica": "music", "music": "music",
    "videos": "videos", "video": "videos",
    "home": "home", "pasta pessoal": "home", "usuario": "home", "pasta do usuario": "home",
}


def resolve_folder(ctx: ToolContext, name: str | None) -> Path | None:
    if not name:
        return None
    n = normalize(name)
    for prefix in ("pasta ", "a pasta ", "na pasta ", "em ", "no ", "na "):
        if n.startswith(prefix):
            n = n[len(prefix):]
    if n in ("aqui", "nessa pasta", "esta pasta", "essa pasta", "atual", "this folder", "here"):
        cur = ctx.services.context.latest_file_or_folder()
        if cur:
            p = Path(cur)
            return p if p.is_dir() else p.parent
        return None
    key = FOLDER_ALIASES.get(n)
    folders = ctx.services.platform.user_folders()
    if key and key in folders:
        return folders[key]
    p = Path(os.path.expandvars(os.path.expanduser(name)))
    if p.is_absolute() and p.is_dir():
        return check_read(p)
    # A folder name inside a known folder or home, e.g. "Projetos".
    for base in [folders.get("home", Path.home()), folders.get("documents"), folders.get("desktop")]:
        if base:
            cand = base / name
            if cand.is_dir():
                return cand
    return None


def date_range(expr: str | None) -> tuple[float | None, float | None]:
    if not expr:
        return None, None
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    e = normalize(expr)
    if e in ("hoje", "today"):
        return today.timestamp(), None
    if e in ("ontem", "yesterday"):
        return (today - timedelta(days=1)).timestamp(), today.timestamp()
    if e in ("semana", "esta semana", "week", "this week", "ultimos 7 dias", "semana passada", "last week"):
        return (today - timedelta(days=7)).timestamp(), None
    if e in ("mes", "este mes", "month", "this month", "ultimos 30 dias", "mes passado"):
        return (today - timedelta(days=30)).timestamp(), None
    if e in ("ano", "este ano", "year"):
        return (today - timedelta(days=365)).timestamp(), None
    return None, None


def _file_entity(r: dict[str, Any]) -> dict[str, Any]:
    return {"path": r["path"], "name": r["name"], "mtime": r["mtime"], "isDir": r["isDir"]}


@tool("search_files", "Pesquisar arquivos",
      "Pesquisa arquivos e pastas no índice local por nome, conteúdo, extensão, pasta e data de modificação.",
      L.READ, "files",
      [ToolParam("query", "string", "Termos de busca (pode ser vazio para filtrar só por tipo/data)", required=False,
                 max_length=200),
       ToolParam("extensions", "array", "Extensões ou tipos (pdf, docx, apresentacao, planilha, imagem...)",
                 required=False),
       ToolParam("folder", "string", "Pasta onde procurar (Downloads, Documentos, caminho, 'aqui')", required=False,
                 max_length=500),
       ToolParam("modified", "string", "Quando foi modificado", required=False,
                 enum=["today", "yesterday", "week", "month", "year"]),
       ToolParam("kind", "string", "Tipo de item", required=False, enum=["any", "file", "dir", "project"],
                 default="any"),
       ToolParam("sort", "string", "Ordenação", required=False, enum=["relevance", "recent"], default="relevance"),
       ToolParam("limit", "integer", "Máximo de resultados", required=False, default=10, minimum=1, maximum=50)],
      describe=lambda a: f"Pesquisar arquivos: {a.get('query') or a.get('extensions') or 'recentes'}")
async def search_files(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    exts: list[str] = []
    for e in args.get("extensions") or []:
        key = normalize(e).rstrip("s")
        exts.extend(EXT_GROUPS.get(key, EXT_GROUPS.get(normalize(e), [normalize(e).lstrip(".")])))
    folder = resolve_folder(ctx, args.get("folder"))
    if args.get("folder") and folder is None:
        return fail(f"Não encontrei a pasta '{args['folder']}'.")
    after, before = date_range(args.get("modified"))
    kind = None if args.get("kind") in (None, "any") else args["kind"]
    terms = args.get("query") or ""
    fi = ctx.services.files
    sort = args.get("sort") or ("recent" if not terms else "relevance")
    results = await asyncio.to_thread(fi.search, terms, exts=exts or None, folder=folder, modified_after=after,
                                      modified_before=before, kind=kind, limit=args.get("limit", 10), sort=sort)
    source = "índice"
    if not results and exts and terms:
        # File-type words ("apresentação", "documento") are hints, not hard filters: retry by name/content.
        results = await asyncio.to_thread(fi.search, terms, folder=folder, modified_after=after,
                                          modified_before=before, kind=kind, limit=args.get("limit", 10), sort=sort)
    if not results and terms and (fi.status.state == "indexing" or fi.status.files == 0 or folder is not None):
        roots = [folder] if folder else fi.roots()
        results = await asyncio.to_thread(fi.live_search, terms, roots, 2.5, args.get("limit", 10))
        source = "busca direta"
    if not results:
        what = f"'{terms}'" if terms else "esses critérios"
        return ok(f"Não encontrei nada para {what}.", {"results": [], "source": source},
                  entities={"query": terms or None})
    first = results[0]
    n = len(results)
    msg = (f"Encontrei {n} resultado{'s' if n > 1 else ''}. " if n > 1 else "Encontrei 1 resultado. ")
    msg += f"O {'mais recente' if sort == 'recent' else 'principal'} é {first['name']}, modificado {fmt.when(first['mtime'])}."
    ent: dict[str, Any] = {"files": [_file_entity(r) for r in results], "query": terms or None}
    if n == 1:
        ent["file" if not first["isDir"] else "folder"] = _file_entity(first)
    return ok(msg, {"results": results, "source": source, "folder": str(folder) if folder else None}, entities=ent)


@tool("find_projects", "Encontrar projetos",
      "Lista projetos de software encontrados (pastas com package.json, pyproject.toml, .git, .sln...).",
      L.READ, "files",
      [ToolParam("query", "string", "Nome ou parte do nome do projeto", required=False, max_length=120),
       ToolParam("limit", "integer", "Máximo", required=False, default=10, minimum=1, maximum=50)],
      describe=lambda a: f"Procurar projetos {a.get('query') or ''}".strip())
async def find_projects(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    q = args.get("query") or ""
    results = await asyncio.to_thread(ctx.services.files.projects, q, args.get("limit", 10))
    if not results and q:
        # fall back to any folder whose name matches
        results = await asyncio.to_thread(ctx.services.files.search, q, kind="dir", limit=args.get("limit", 10))
    if not results:
        state = ctx.services.files.status.state
        extra = " O índice ainda está sendo construído." if state == "indexing" else ""
        return ok(f"Não encontrei projetos{f' com {q}' if q else ''}.{extra}", {"results": []})
    names = [r["name"] for r in results[:3]]
    msg = f"Localizei {len(results)} projeto{'s' if len(results) > 1 else ''}"
    msg += f". O mais relevante é {results[0]['name']}." if q else f": {fmt.join_pt(names)}."
    ent: dict[str, Any] = {"files": [_file_entity(r) for r in results]}
    ent["project"] = _file_entity(results[0])
    return ok(msg, {"results": results}, entities=ent)


def _open_level(args: dict[str, Any]) -> L:
    # Unknown file types are confirmed first; only folders and known documents/media open directly.
    try:
        return L.REVERSIBLE if open_risk(check_read(args.get("path", ""))) == "safe" else L.IMPORTANT
    except (PathDenied, OSError, ValueError):
        return L.IMPORTANT


@tool("open_path", "Abrir arquivo ou pasta", "Abre um documento ou mídia com o aplicativo padrão, ou uma pasta no Explorador.",
      L.REVERSIBLE, "files",
      [ToolParam("path", "string", "Caminho completo", max_length=1000)],
      dynamic_level=_open_level,
      describe=lambda a: f"Abrir {Path(a.get('path', '')).name or a.get('path')}")
async def open_path(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    p = check_read(args["path"])
    if not p.exists():
        return fail(f"Não encontrei {p}.")
    if open_risk(p) == "blocked":
        return fail("Por segurança, não executo programas, scripts ou atalhos diretamente. Use 'abrir aplicativo'.")
    await asyncio.to_thread(ctx.services.platform.open_path, p)
    kind = "folder" if p.is_dir() else "file"
    return ok(f"Abrindo {p.name or str(p)}.", {"path": str(p)},
              entities={kind: {"path": str(p), "name": p.name or str(p)}})


@tool("open_folder", "Abrir pasta",
      "Abre uma pasta conhecida (Downloads, Documentos, Área de Trabalho, Imagens...) ou um caminho.",
      L.REVERSIBLE, "files",
      [ToolParam("name", "string", "Nome da pasta ou caminho", max_length=500)],
      describe=lambda a: f"Abrir a pasta {a.get('name')}")
async def open_folder(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    folder = resolve_folder(ctx, args["name"])
    if folder is None:
        hits = await asyncio.to_thread(ctx.services.files.search, args["name"], kind="dir", limit=1)
        if hits:
            folder = Path(hits[0]["path"])
    if folder is None or not folder.is_dir():
        return fail(f"Não encontrei a pasta '{args['name']}'.")
    await asyncio.to_thread(ctx.services.platform.open_path, folder)
    return ok(f"Pasta {folder.name or folder} aberta.", {"path": str(folder)},
              entities={"folder": {"path": str(folder), "name": folder.name or str(folder)}})


def _default_parent(ctx: ToolContext) -> Path:
    cur = ctx.services.context.most_recent(("folder", "project"))
    if cur and time.time() - cur.ts < 900 and isinstance(cur.value, dict):
        p = Path(cur.value["path"])
        if p.is_dir():
            return p
    folders = ctx.services.platform.user_folders()
    return folders.get("documents") or folders.get("home") or Path.home()


def _extra_roots(ctx: ToolContext) -> list[str]:
    return list(ctx.services.settings.system.file_index_roots)


@tool("create_folder", "Criar pasta", "Cria uma pasta nova (padrão: pasta atual do contexto ou Documentos).",
      L.REVERSIBLE, "files",
      [ToolParam("name", "string", "Nome da nova pasta", max_length=200),
       ToolParam("parent", "string", "Onde criar (pasta conhecida ou caminho)", required=False, max_length=1000)],
      describe=lambda a: f"Criar a pasta '{a.get('name')}'" + (f" em {a['parent']}" if a.get("parent") else ""))
async def create_folder(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    name = safe_filename(args["name"])
    parent = resolve_folder(ctx, args.get("parent")) if args.get("parent") else _default_parent(ctx)
    if parent is None:
        return fail(f"Não encontrei a pasta '{args.get('parent')}'.")
    target = check_write(parent / name, _extra_roots(ctx))
    if target.exists():
        return ok(f"A pasta {name} já existe em {parent.name}.", {"path": str(target)},
                  entities={"folder": {"path": str(target), "name": name}}, verified=True)
    await asyncio.to_thread(target.mkdir, parents=False, exist_ok=False)
    await ctx.services.files.refresh_async([parent], depth=0)
    return ok(f"Pasta {name} criada em {parent.name or parent}.", {"path": str(target)},
              entities={"folder": {"path": str(target), "name": name}}, verified=target.is_dir())


@tool("rename_path", "Renomear", "Renomeia um arquivo ou pasta.", L.IMPORTANT, "files",
      [ToolParam("path", "string", "Caminho atual", max_length=1000),
       ToolParam("new_name", "string", "Novo nome (sem caminho)", max_length=200)],
      describe=lambda a: f"Renomear {Path(a['path']).name} para {a['new_name']}")
async def rename_path(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    src = check_write(args["path"], _extra_roots(ctx))
    if not src.exists():
        return fail(f"Não encontrei {src}.")
    dest = check_write(src.parent / safe_filename(args["new_name"]), _extra_roots(ctx))
    if dest.exists():
        return fail(f"Já existe um item chamado {dest.name} nessa pasta.")
    await asyncio.to_thread(src.rename, dest)
    await ctx.services.files.refresh_async([src.parent], depth=0)
    kind = "folder" if dest.is_dir() else "file"
    return ok(f"Renomeado para {dest.name}.", {"from": str(src), "to": str(dest)},
              entities={kind: {"path": str(dest), "name": dest.name}}, verified=dest.exists())


def _dest_folder(ctx: ToolContext, dest: str) -> Path:
    folder = resolve_folder(ctx, dest)
    if folder is None:
        p = Path(os.path.expandvars(os.path.expanduser(dest)))
        if not p.is_absolute():
            raise ToolExecutionError(f"Não encontrei a pasta de destino '{dest}'.")
        folder = p
    return folder


@tool("move_path", "Mover", "Move um arquivo ou pasta para outra pasta.", L.IMPORTANT, "files",
      [ToolParam("path", "string", "Item a mover", max_length=1000),
       ToolParam("destination", "string", "Pasta de destino", max_length=1000)],
      describe=lambda a: f"Mover {Path(a['path']).name} para {a['destination']}")
async def move_path(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    roots = _extra_roots(ctx)
    src = check_write(args["path"], roots)
    if not src.exists():
        return fail(f"Não encontrei {src}.")
    folder = check_write(_dest_folder(ctx, args["destination"]) / "_", roots).parent
    if not folder.is_dir():
        return fail(f"A pasta de destino {folder} não existe.")
    dest = folder / src.name
    if dest.exists():
        return fail(f"Já existe {src.name} em {folder.name}.")
    await asyncio.to_thread(shutil.move, str(src), str(dest))
    await ctx.services.files.refresh_async([src.parent, folder], depth=1)
    kind = "folder" if dest.is_dir() else "file"
    return ok(f"{src.name} movido para {folder.name}.", {"from": str(src), "to": str(dest)},
              entities={kind: {"path": str(dest), "name": dest.name}}, verified=dest.exists() and not src.exists())


@tool("copy_path", "Copiar", "Copia um arquivo ou pasta para outra pasta.", L.REVERSIBLE, "files",
      [ToolParam("path", "string", "Item a copiar", max_length=1000),
       ToolParam("destination", "string", "Pasta de destino", max_length=1000)],
      describe=lambda a: f"Copiar {Path(a['path']).name} para {a['destination']}")
async def copy_path(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    roots = _extra_roots(ctx)
    src = check_read(args["path"])
    if not src.exists():
        return fail(f"Não encontrei {src}.")
    folder = check_write(_dest_folder(ctx, args["destination"]) / "_", roots).parent
    if not folder.is_dir():
        return fail(f"A pasta de destino {folder} não existe.")
    dest = folder / src.name
    n = 1
    while dest.exists():  # never overwrite: "x (cópia).txt", "x (cópia 2).txt", ...
        label = "cópia" if n == 1 else f"cópia {n}"
        dest = folder / (f"{src.name} ({label})" if src.is_dir() else f"{src.stem} ({label}){src.suffix}")
        n += 1
    if src.is_dir():
        await asyncio.to_thread(shutil.copytree, src, dest)
    else:
        await asyncio.to_thread(shutil.copy2, src, dest)
    await ctx.services.files.refresh_async([folder], depth=1)
    return ok(f"{src.name} copiado para {folder.name}.", {"from": str(src), "to": str(dest)},
              entities={"file": {"path": str(dest), "name": dest.name}}, verified=dest.exists())


def _delete_describe(a: dict[str, Any]) -> str:
    paths = a.get("paths") or []
    files = sum(1 for p in paths if os.path.isfile(p))
    dirs = sum(1 for p in paths if os.path.isdir(p))
    what = []
    if files:
        what.append(f"{files} arquivo{'s' if files > 1 else ''}")
    if dirs:
        what.append(f"{dirs} pasta{'s' if dirs > 1 else ''}")
    names = ", ".join(Path(p).name for p in paths[:3]) + ("…" if len(paths) > 3 else "")
    label = (" e ".join(what) or f"{len(paths)} item(ns)") + (f" ({names})" if names else "")
    if a.get("permanent"):
        return f"Essa ação apagará permanentemente {label}. Deseja continuar?"
    return f"Mover {label} para a Lixeira"


@tool("delete_paths", "Apagar arquivos",
      "Envia arquivos/pastas para a Lixeira (padrão) ou apaga permanentemente. Sempre exige confirmação.",
      L.DESTRUCTIVE, "files",
      [ToolParam("paths", "array", "Caminhos a apagar"),
       ToolParam("permanent", "boolean", "Apagar permanentemente em vez de usar a Lixeira", required=False,
                 default=False)],
      describe=_delete_describe)
async def delete_paths(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    roots = _extra_roots(ctx)
    targets = [check_write(p, roots) for p in args["paths"]]
    missing = [t for t in targets if not t.exists()]
    targets = [t for t in targets if t.exists()]
    if not targets:
        return fail("Nenhum dos itens existe.")
    if args.get("permanent"):
        for t in targets:
            if t.is_dir():
                await asyncio.to_thread(shutil.rmtree, t)
            else:
                await asyncio.to_thread(t.unlink)
        verb = "apagado" + ("s permanentemente" if len(targets) > 1 else " permanentemente")
    else:
        from send2trash import send2trash

        for t in targets:
            await asyncio.to_thread(send2trash, str(t))
        verb = "enviado" + ("s" if len(targets) > 1 else "") + " para a Lixeira"
    gone = all(not t.exists() for t in targets)
    await ctx.services.files.refresh_async(list({t.parent for t in targets}), depth=0)
    msg = f"{len(targets)} ite{'ns' if len(targets) > 1 else 'm'} {verb}."
    if missing:
        msg += f" {len(missing)} não existia(m)."
    return ok(msg, {"deleted": [str(t) for t in targets]}, verified=gone)


MAX_READ_CHARS = 12_000


def _read_text(path: Path) -> str:
    ext = path.suffix.lower().lstrip(".")
    size = path.stat().st_size
    text = extract_text(path, ext, size)
    if not text and size <= 1_000_000:
        try:
            raw = path.read_bytes()
            if b"\x00" not in raw[:2048]:
                text = raw.decode("utf-8", errors="ignore")
        except OSError:
            text = ""
    return text


def _pick_path(ctx: ToolContext, path: str | None) -> Path:
    raw = path or ctx.services.context.latest_file_or_folder()
    if not raw:
        raise ToolExecutionError("Qual arquivo? Não há nenhum arquivo no contexto.")
    p = check_read(raw)
    if not p.is_file():
        raise ToolExecutionError(f"{p.name} não é um arquivo legível.")
    return p


@tool("read_file", "Ler arquivo", "Lê o texto de um arquivo (txt, md, código, pdf, docx) para análise.",
      L.READ, "files",
      [ToolParam("path", "string", "Caminho do arquivo (vazio = arquivo do contexto)", required=False,
                 max_length=1000)],
      describe=lambda a: f"Ler {Path(a['path']).name if a.get('path') else 'o arquivo atual'}")
async def read_file(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    p = _pick_path(ctx, args.get("path"))
    text = await asyncio.to_thread(_read_text, p)
    if not text.strip():
        return fail(f"Não consegui extrair texto de {p.name}.")
    truncated = len(text) > MAX_READ_CHARS
    return ok(f"Li {p.name} ({len(text)} caracteres{', trecho inicial' if truncated else ''}).",
              {"path": str(p), "text": text[:MAX_READ_CHARS], "truncated": truncated},
              entities={"file": {"path": str(p), "name": p.name}})


@tool("summarize_file", "Resumir documento", "Resume um documento usando o modelo de IA configurado.",
      L.READ, "files",
      [ToolParam("path", "string", "Caminho do arquivo (vazio = arquivo do contexto)", required=False,
                 max_length=1000),
       ToolParam("focus", "string", "Foco do resumo (opcional)", required=False, max_length=300)],
      describe=lambda a: f"Resumir {Path(a['path']).name if a.get('path') else 'o documento atual'}", timeout_s=300)
async def summarize_file(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    p = _pick_path(ctx, args.get("path"))
    text = await asyncio.to_thread(_read_text, p)
    if not text.strip():
        return fail(f"Não consegui extrair texto de {p.name}.")
    ent = {"file": {"path": str(p), "name": p.name}}
    providers = ctx.services.providers
    provider = await providers.active_or_none()
    if provider is None:
        preview = " ".join(text.split())[:400]
        return ok(f"Sem modelo de IA disponível para resumir. Início de {p.name}: {preview}…",
                  {"path": str(p), "summary": None}, entities=ent)
    await ctx.progress("Resumindo com IA")
    focus = f" Foque em: {args['focus']}." if args.get("focus") else ""
    prompt = (f"Resuma o documento abaixo em português do Brasil, em no máximo 6 frases objetivas.{focus}\n\n"
              f"Documento: {p.name}\n---\n{text[:MAX_READ_CHARS]}")
    summary = await providers.complete(prompt, max_tokens=500)
    return ok(summary.strip(), {"path": str(p), "summary": summary}, entities=ent)


ORGANIZE_GROUPS = {
    "Documentos": {"pdf", "doc", "docx", "odt", "txt", "rtf", "md"},
    "Planilhas": {"xls", "xlsx", "csv", "ods"},
    "Apresentações": {"ppt", "pptx", "odp", "key"},
    "Imagens": {"png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "tiff"},
    "Vídeos": {"mp4", "mkv", "mov", "avi", "webm", "wmv"},
    "Músicas": {"mp3", "flac", "wav", "m4a", "ogg", "aac"},
    "Compactados": {"zip", "rar", "7z", "tar", "gz", "bz2"},
    "Instaladores": {"exe", "msi", "msix", "appx", "dmg", "deb", "rpm"},
    "Código": {"py", "js", "ts", "tsx", "jsx", "java", "cs", "cpp", "c", "go", "rs", "html", "css", "json", "sql"},
}


def _organize_plan(folder: Path) -> list[tuple[Path, str]]:
    plan = []
    for entry in folder.iterdir():
        if not entry.is_file() or entry.name.startswith((".", "~$")) or entry.name.lower() == "desktop.ini":
            continue
        ext = entry.suffix.lower().lstrip(".")
        group = next((g for g, exts in ORGANIZE_GROUPS.items() if ext in exts), "Outros")
        plan.append((entry, group))
    return plan


def _organize_describe(a: dict[str, Any]) -> str:
    folder = a.get("_resolved") or a.get("folder")
    try:
        n = len(_organize_plan(Path(folder))) if folder and Path(folder).is_dir() else None
    except OSError:
        n = None
    count = f"{n} arquivos" if n is not None else "os arquivos"
    return f"Organizar {count} de {Path(folder).name if folder else 'a pasta'} em subpastas por tipo"


@tool("organize_folder", "Organizar pasta",
      "Organiza os arquivos soltos de uma pasta em subpastas por tipo (Documentos, Imagens, Instaladores...).",
      L.IMPORTANT, "files",
      [ToolParam("folder", "string", "Pasta a organizar (ex.: Downloads)", max_length=1000)],
      describe=_organize_describe)
async def organize_folder(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    folder = resolve_folder(ctx, args["folder"])
    if folder is None:
        return fail(f"Não encontrei a pasta '{args['folder']}'.")
    check_write(folder / "_", _extra_roots(ctx))
    plan = await asyncio.to_thread(_organize_plan, folder)
    if not plan:
        return ok(f"{folder.name} já está organizada: não há arquivos soltos.", {"moved": 0})
    moved: list[dict[str, str]] = []
    for src, group in plan:
        dest_dir = folder / group
        try:
            dest_dir.mkdir(exist_ok=True)
            dest = dest_dir / src.name
            if dest.exists():
                dest = dest_dir / f"{src.stem} ({int(time.time())}){src.suffix}"
            await asyncio.to_thread(shutil.move, str(src), str(dest))
            moved.append({"from": str(src), "to": str(dest)})
        except (OSError, PathDenied):
            continue
    manifest_dir = ctx.services.config.data_dir / "organize"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    manifest = manifest_dir / f"{folder.name}-{int(time.time())}.json"
    manifest.write_text(json.dumps(moved, ensure_ascii=False, indent=1), encoding="utf-8")
    groups = sorted({Path(m["to"]).parent.name for m in moved})
    await ctx.services.files.refresh_async([folder], depth=1)
    return ok(f"Organizei {len(moved)} arquivos de {folder.name} em {fmt.join_pt(groups)}.",
              {"moved": len(moved), "manifest": str(manifest)},
              entities={"folder": {"path": str(folder), "name": folder.name}})


TOOLS: list[Tool] = [search_files, find_projects, open_path, open_folder, create_folder, rename_path, move_path,
                     copy_path, delete_paths, read_file, summarize_file, organize_folder]
