FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONPATH=/app/src ATLAS_PAPER_HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY src/atlas/cloud_paper /app/src/atlas/cloud_paper
COPY src/atlas/__init__.py /app/src/atlas/__init__.py
USER 65532:65532
EXPOSE 8787
CMD ["python","-m","atlas.cloud_paper.server"]
