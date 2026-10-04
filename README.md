# PortWise

PortWise is a backend service for calculating landed import costs in Nigeria, including duty, statutory levies, VAT, and total landed cost.

## Project structure

- `portwise-backend/` - FastAPI application and backend logic
- `Dockerfile` - container setup for running the app
- `render.yaml` - deployment configuration for Render

## Backend

The API is built with FastAPI and exposes a calculation endpoint for import cost previews.

### Run locally

```bash
cd portwise-backend
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Then open:

- http://localhost:8000/
- http://localhost:8000/docs

## API overview

- `GET /` - health check
- `POST /api/v1/calculate-preview` - calculate a landed-cost preview

## Notes

This project currently provides a calculation preview flow for importing goods and estimating total landed cost using default assumptions for FX rate, duty rate, and levy values.
