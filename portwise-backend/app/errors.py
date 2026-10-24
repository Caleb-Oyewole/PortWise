"""Business-rule rejections.

The body keeps ``detail`` as a plain string (what the API returned before) and
adds a machine-readable ``code`` so the frontend can pick the right warning state.

Codes: prohibited_item, unsupported_goods, unknown_hs_code, no_tariff_in_force,
unsupported_currency.
"""
from fastapi import Request
from fastapi.responses import JSONResponse


class PortWiseError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


async def portwise_error_handler(_: Request, exc: Exception) -> JSONResponse:
    # Starlette types handlers as taking `Exception`; this one is only registered for PortWiseError.
    if not isinstance(exc, PortWiseError):
        raise exc
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "code": exc.code, "detail": exc.message},
    )
