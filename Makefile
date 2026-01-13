.PHONY: build load-kind deploy demo-local teardown sanity-check help

# Load environment variables
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# Default values
NAMESPACE ?= elastic-metrics-demo
IMAGE_REGISTRY ?= 
IMAGE_TAG ?= latest
FRONTEND_IMAGE ?= $(if $(IMAGE_REGISTRY),$(IMAGE_REGISTRY)/frontend:$(IMAGE_TAG),frontend:latest)
API_IMAGE ?= $(if $(IMAGE_REGISTRY),$(IMAGE_REGISTRY)/api:$(IMAGE_TAG),api:latest)
WORKER_IMAGE ?= $(if $(IMAGE_REGISTRY),$(IMAGE_REGISTRY)/worker:$(IMAGE_TAG),worker:latest)
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
	@echo "  Frontend: $(FRONTEND_IMAGE)"
	@echo "  API: $(API_IMAGE)"
	@echo "  Worker: $(WORKER_IMAGE)"
	docker build -t $(FRONTEND_IMAGE) ./services/frontend
	docker build -t $(API_IMAGE) ./services/api
	docker build -t $(WORKER_IMAGE) ./services/worker
	@echo "Build complete!"

push: build
	@if [ -z "$(IMAGE_REGISTRY)" ]; then \
		echo "Error: IMAGE_REGISTRY must be set for push target"; \
		echo "Examples:"; \
		echo "  IMAGE_REGISTRY=123456789.dkr.ecr.us-west-2.amazonaws.com make push  # AWS ECR"; \
		echo "  IMAGE_REGISTRY=gcr.io/my-project make push  # GCP GCR"; \
		echo "  IMAGE_REGISTRY=myuser make push  # Docker Hub"; \
		exit 1; \
	fi
	@echo "Pushing images to $(IMAGE_REGISTRY)..."
	@echo "  Pushing $(FRONTEND_IMAGE)..."
	docker push $(FRONTEND_IMAGE)
	@echo "  Pushing $(API_IMAGE)..."
	docker push $(API_IMAGE)
	@echo "  Pushing $(WORKER_IMAGE)..."
	docker push $(WORKER_IMAGE)
	@echo "Push complete!"
	@echo ""
	@echo "Set these environment variables for deployment:"
	@echo "  export FRONTEND_IMAGE=$(FRONTEND_IMAGE)"
	@echo "  export API_IMAGE=$(API_IMAGE)"
	@echo "  export WORKER_IMAGE=$(WORKER_IMAGE)"

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
