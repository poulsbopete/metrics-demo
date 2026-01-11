# Terraform EKS Deployment (Optional)

This directory contains optional Terraform configuration for deploying the demo to AWS EKS.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform 1.5+
- kubectl
- aws-iam-authenticator or AWS CLI v2 with EKS support

## Quick Start

1. **Set variables**:
   ```bash
   export AWS_REGION=us-east-1
   export CLUSTER_NAME=elastic-metrics-demo
   ```

2. **Initialize Terraform**:
   ```bash
   cd terraform
   terraform init
   ```

3. **Plan and apply**:
   ```bash
   terraform plan
   terraform apply
   ```

4. **Configure kubectl**:
   ```bash
   aws eks update-kubeconfig --name $CLUSTER_NAME --region $AWS_REGION
   ```

5. **Deploy the demo**:
   ```bash
   cd ..
   export OVERLAY=eks
   make deploy
   ```

## Variables

Edit `variables.tf` or pass via command line:

- `cluster_name`: EKS cluster name (default: `elastic-metrics-demo`)
- `region`: AWS region (default: `us-east-1`)
- `node_instance_type`: EC2 instance type (default: `t3.medium`)
- `node_count`: Number of worker nodes (default: `2`)

## Outputs

After applying, Terraform will output:
- `cluster_endpoint`: EKS cluster API endpoint
- `cluster_name`: Cluster name
- `kubeconfig_command`: Command to configure kubectl

## Cleanup

To destroy the EKS cluster:
```bash
cd terraform
terraform destroy
```

## Notes

- The Terraform configuration creates a minimal EKS cluster suitable for the demo
- For production use, consider adding:
  - VPC configuration
  - Security groups
  - IAM roles and policies
  - Node groups with auto-scaling
  - Network policies

## Cost Estimate

Running the demo on EKS:
- EKS control plane: ~$0.10/hour
- 2x t3.medium nodes: ~$0.08/hour each = ~$0.16/hour
- **Total**: ~$0.26/hour (~$6.24/day)

Remember to destroy the cluster when not in use!
