#!/bin/bash
set -e

# Script to build and push images to a container registry
# Supports AWS ECR, GCP GCR, and Docker Hub

REPO_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$REPO_ROOT"

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if IMAGE_REGISTRY is set
if [ -z "$IMAGE_REGISTRY" ]; then
    echo "ERROR: IMAGE_REGISTRY must be set"
    echo ""
    echo "Examples:"
    echo "  # AWS ECR:"
    echo "  export AWS_REGION=us-west-2"
    echo "  export IMAGE_REGISTRY=\$(aws ecr describe-repositories --repository-names metrics-demo --region \$AWS_REGION --query 'repositories[0].repositoryUri' --output text 2>/dev/null || echo \"\")"
    echo "  if [ -z \"\$IMAGE_REGISTRY\" ]; then"
    echo "    aws ecr create-repository --repository-name metrics-demo --region \$AWS_REGION"
    echo "    export IMAGE_REGISTRY=\$(aws ecr describe-repositories --repository-names metrics-demo --region \$AWS_REGION --query 'repositories[0].repositoryUri' --output text)"
    echo "  fi"
    echo "  export IMAGE_TAG=latest"
    echo "  ./scripts/build-and-push-images.sh"
    echo ""
    echo "  # GCP GCR:"
    echo "  export IMAGE_REGISTRY=gcr.io/\$(gcloud config get-value project)"
    echo "  export IMAGE_TAG=latest"
    echo "  ./scripts/build-and-push-images.sh"
    echo ""
    echo "  # Docker Hub:"
    echo "  export IMAGE_REGISTRY=yourusername"
    echo "  export IMAGE_TAG=latest"
    echo "  ./scripts/build-and-push-images.sh"
    exit 1
fi

IMAGE_TAG=${IMAGE_TAG:-latest}

echo "Building and pushing images to: $IMAGE_REGISTRY"
echo "Tag: $IMAGE_TAG"
echo ""

# Authenticate with registry if needed
if [[ "$IMAGE_REGISTRY" == *.dkr.ecr.*.amazonaws.com* ]]; then
    echo "Detected AWS ECR, authenticating..."
    AWS_REGION=$(echo "$IMAGE_REGISTRY" | sed -n 's/.*\.dkr\.ecr\.\([^.]*\)\.amazonaws\.com.*/\1/p')
    if [ -n "$AWS_REGION" ]; then
        aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$IMAGE_REGISTRY"
    else
        echo "Warning: Could not determine AWS region from registry URL"
    fi
elif [[ "$IMAGE_REGISTRY" == gcr.io/* ]] || [[ "$IMAGE_REGISTRY" == *.gcr.io/* ]]; then
    echo "Detected GCP GCR, authenticating..."
    gcloud auth configure-docker --quiet || true
elif [[ "$IMAGE_REGISTRY" != *.* ]]; then
    echo "Detected Docker Hub, ensure you're logged in:"
    echo "  docker login"
fi

# Build images
echo "Building images..."
make build IMAGE_REGISTRY="$IMAGE_REGISTRY" IMAGE_TAG="$IMAGE_TAG"

# Push images
echo ""
echo "Pushing images..."
make push IMAGE_REGISTRY="$IMAGE_REGISTRY" IMAGE_TAG="$IMAGE_TAG"

echo ""
echo "✅ Images pushed successfully!"
echo ""
echo "Exporting image variables..."
export FRONTEND_IMAGE="$IMAGE_REGISTRY/frontend:$IMAGE_TAG"
export API_IMAGE="$IMAGE_REGISTRY/api:$IMAGE_TAG"
export WORKER_IMAGE="$IMAGE_REGISTRY/worker:$IMAGE_TAG"

echo ""
echo "Images are set. You can now deploy with:"
echo "  export ELASTIC_OTLP_ENDPOINT=https://your-endpoint.ingest.elastic.cloud:443"
echo "  export ELASTIC_API_KEY=your-api-key-here"
echo "  export OVERLAY=eks"
echo "  make deploy"
echo ""
echo "Or source this script to use the exported variables:"
echo "  source ./scripts/build-and-push-images.sh"