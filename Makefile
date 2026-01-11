.PHONY: build load-kind deploy demo-local teardown sanity-check help

# Load environment variables
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# Default values
NAMESPACE ?= elastic-metrics-demo
FRONTEND_IMAGE ?= frontend:latest
API_IMAGE ?= api:latest
WORKER_IMAGE ?= worker:latest
KIND_CLUSTER ?= metrics-demo

help:
	@echo "Available targets:"
	@echo "  build          - Build all Docker images"
	@echo "  load-kind      - Load images into kind cluster"
	@echo "  deploy         - Deploy to Kubernetes"
	@echo "  demo-local     - Full local setup (kind + build + deploy)"
	@echo "  teardown       - Remove cluster and resources"
	@echo "  sanity-check   - Verify services are running"

build:
	@echo "Building Docker images..."
	docker build -t $(FRONTEND_IMAGE) ./services/frontend
	docker build -t $(API_IMAGE) ./services/api
	docker build -t $(WORKER_IMAGE) ./services/worker
	@echo "Build complete!"

load-kind:
	@echo "Loading images into kind cluster..."
	kind load docker-image $(FRONTEND_IMAGE) --name $(KIND_CLUSTER)
	kind load docker-image $(API_IMAGE) --name $(KIND_CLUSTER)
	kind load docker-image $(WORKER_IMAGE) --name $(KIND_CLUSTER)
	@echo "Images loaded!"

deploy:
	@echo "Deploying to Kubernetes..."
	@if [ -z "$$ELASTIC_OTLP_ENDPOINT" ] || [ -z "$$ELASTIC_API_KEY" ]; then \
		echo "Error: ELASTIC_OTLP_ENDPOINT and ELASTIC_API_KEY must be set"; \
		exit 1; \
	fi
	@./scripts/deploy.sh
	@echo "Deployment complete!"

demo-local:
	@echo "Setting up local demo with kind..."
	@if [ -z "$$ELASTIC_OTLP_ENDPOINT" ] || [ -z "$$ELASTIC_API_KEY" ]; then \
		echo "Error: ELASTIC_OTLP_ENDPOINT and ELASTIC_API_KEY must be set"; \
		echo "Create a .env file or export these variables"; \
		exit 1; \
	fi
	@./scripts/setup-kind.sh
	@$(MAKE) build
	@$(MAKE) load-kind
	@$(MAKE) deploy
	@echo ""
	@echo "Demo is ready!"
	@echo "Port-forward the frontend: kubectl port-forward -n $(NAMESPACE) svc/frontend 8080:8080"
	@echo "Then visit: http://localhost:8080/demo"

teardown:
	@echo "Tearing down demo..."
	@./scripts/teardown.sh
	@echo "Teardown complete!"

sanity-check:
	@echo "Running sanity checks..."
	@./scripts/sanity-check.sh
	@echo "Sanity checks passed!"
