#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  CLUSTER_NAME
  API_SERVICE
  WEB_SERVICE
  WORKER_SERVICE
  API_IMAGE_URI
  WEB_IMAGE_URI
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "Missing required env var: ${var}"
    exit 1
  fi
done

update_service() {
  local service_name="$1"
  local container_name="$2"
  local image_uri="$3"

  echo "Deploying ${service_name} (${container_name}) with image ${image_uri}"

  local current_td
  current_td="$(aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "$service_name" \
    --query 'services[0].taskDefinition' \
    --output text)"

  if [ "$current_td" = "None" ] || [ -z "$current_td" ]; then
    echo "Service ${service_name} not found in cluster ${CLUSTER_NAME}"
    exit 1
  fi

  aws ecs describe-task-definition \
    --task-definition "$current_td" \
    --query 'taskDefinition' \
    --output json > taskdef-current.json

  jq \
    --arg container "$container_name" \
    --arg image "$image_uri" \
    '
      del(
        .taskDefinitionArn,
        .revision,
        .status,
        .requiresAttributes,
        .compatibilities,
        .registeredAt,
        .registeredBy
      )
      | .containerDefinitions = (
          .containerDefinitions
          | map(
              if .name == $container
              then .image = $image
              else .
              end
            )
        )
    ' taskdef-current.json > taskdef-next.json

  local next_td
  next_td="$(aws ecs register-task-definition \
    --cli-input-json file://taskdef-next.json \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)"

  aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$service_name" \
    --task-definition "$next_td" \
    --force-new-deployment >/dev/null

  aws ecs wait services-stable \
    --cluster "$CLUSTER_NAME" \
    --services "$service_name"

  echo "Service ${service_name} is stable on ${next_td}"
}

update_service "$API_SERVICE" "stageos-api" "$API_IMAGE_URI"
update_service "$WORKER_SERVICE" "stageos-worker" "$API_IMAGE_URI"
update_service "$WEB_SERVICE" "stageos-web" "$WEB_IMAGE_URI"
