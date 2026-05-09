pipeline {
  agent any

  environment {
    PROJECT      = "heart-mlops-2026"
    REGION       = "asia-south1"
    REGISTRY     = "${REGION}-docker.pkg.dev/${PROJECT}/heart-app"
    IMAGE        = "${REGISTRY}/heart-ui"
    CLUSTER      = "heart-cluster"
    CLUSTER_ZONE = "${REGION}-a"
    GCP_KEY      = credentials('gcp-service-account-key')
  }

  stages {

    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Build & Push Docker Image') {
      steps {
        sh '''
          gcloud auth activate-service-account --key-file=$GCP_KEY
          gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

          docker build \
            -f docker/Dockerfile \
            -t ${IMAGE}:${GIT_COMMIT} \
            -t ${IMAGE}:latest \
            .

          docker push ${IMAGE}:${GIT_COMMIT}
          docker push ${IMAGE}:latest
        '''
      }
    }

    stage('Deploy to Non-Prod') {
      steps {
        sh '''
          gcloud auth activate-service-account --key-file=$GCP_KEY
          gcloud container clusters get-credentials $CLUSTER \
            --zone $CLUSTER_ZONE --project $PROJECT

          kubectl set image deployment/heart-ui \
            heart-ui=${IMAGE}:${GIT_COMMIT} -n nonprod

          kubectl rollout status deployment/heart-ui \
            -n nonprod --timeout=120s
        '''
      }
    }
  }

  post {
    failure { echo "UI pipeline failed" }
    success { echo "UI deployed to nonprod — image: ${env.IMAGE}:${env.GIT_COMMIT}" }
  }
}

