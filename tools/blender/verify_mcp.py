"""Read-only end-to-end test of the Blender MCP server and scene bridge."""
import asyncio
import json
import os
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    uvx = Path.home() / "AppData/Local/Microsoft/WinGet/Packages/astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe/uvx.exe"
    params = StdioServerParameters(
        command=str(uvx), args=["mcp-for-blender"],
        env={**os.environ, "PYTHONIOENCODING": "utf-8", "DISABLE_TELEMETRY": "true"},
    )
    async with stdio_client(params) as (reader, writer):
        async with ClientSession(reader, writer) as session:
            await session.initialize()
            result = await session.call_tool("get_scene_info", {"limit": 5})
            print(json.dumps(result.model_dump(mode="json"), ensure_ascii=False, indent=2))
            failed_text = any(
                getattr(block, "text", "").startswith("Error getting scene info")
                for block in result.content
            )
            if result.isError or failed_text:
                raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
