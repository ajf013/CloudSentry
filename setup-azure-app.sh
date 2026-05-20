#!/bin/bash
# setup-azure-app.sh
# Automates the creation of a Multi-Tenant Azure AD App Registration for Clerk Integration.

set -e

echo "=========================================================="
echo "      Azure AD App Registration Setup Helper"
echo "=========================================================="

# Check if logged in to Azure CLI
if ! az account show > /dev/null 2>&1; then
    echo "ERROR: You are not logged into Azure CLI."
    echo "Please run 'az login' first and then rerun this script."
    exit 1
fi

# Tenant ID resolution
RESOLVED_TENANT=$(az account show --query tenantId -o tsv 2>/dev/null || true)
if [ -n "$RESOLVED_TENANT" ]; then
    read -p "Enter your Azure Tenant ID [$RESOLVED_TENANT]: " TENANT_ID
    TENANT_ID=${TENANT_ID:-$RESOLVED_TENANT}
else
    read -p "Enter your Azure Tenant ID: " TENANT_ID
fi

if [ -z "$TENANT_ID" ]; then
    echo "ERROR: Tenant ID cannot be empty."
    exit 1
fi

echo "Using Tenant: $TENANT_ID"
az account set --subscription $(az account list --query "[?tenantId=='$TENANT_ID'].id" -o tsv | head -n 1) || true

# Get Clerk Redirect URI
echo ""
echo "Please enter the Redirect URI from your Clerk Dashboard."
echo "Example: https://notable-kitten-79.clerk.accounts.dev/v1/oauth_callback"
read -p "Redirect URI: " REDIRECT_URI

if [ -z "$REDIRECT_URI" ]; then
    echo "ERROR: Redirect URI cannot be empty."
    exit 1
fi

APP_NAME="CloudSentry Dashboard"

echo ""
echo "Creating new Azure AD Application: '$APP_NAME'..."

# 1. Create the App with Multi-Tenant audience first
APP_JSON=$(az ad app create \
    --display-name "$APP_NAME" \
    --sign-in-audience "AzureADMultipleOrgs" \
    --web-redirect-uris "$REDIRECT_URI" \
    --query "{id:id, appId:appId}" \
    -o json)

APP_ID=$(echo "$APP_JSON" | jq -r '.id')
CLIENT_ID=$(echo "$APP_JSON" | jq -r '.appId')

echo "Successfully created Application."
echo "Application Object ID: $APP_ID"
echo "Application Client ID (App ID): $CLIENT_ID"

# 2. Update access token version to 2 (required for personal accounts support)
echo ""
echo "Setting App requestedAccessTokenVersion to 2..."
az ad app update --id "$CLIENT_ID" --requested-access-token-version 2

# 3. Change audience to support both multi-tenant and personal Microsoft accounts
echo ""
echo "Setting App Sign-in Audience to AzureADandPersonalMicrosoftAccount..."
az ad app update --id "$CLIENT_ID" --sign-in-audience "AzureADandPersonalMicrosoftAccount"

# 3.1. Set Application Description
echo ""
echo "Setting Application Description..."
az ad app update --id "$CLIENT_ID" --description "CloudSentry - Cloud Security Posture Management (CSPM) Dashboard" || echo "Warning: Failed to update description."

# 3.2. Upload Application Logo
echo ""
echo "Uploading application logo..."
if [ -f "public/icons/icon-192x192.png" ]; then
    az rest --method PUT --uri "https://graph.microsoft.com/v1.0/applications/$APP_ID/logo" --headers "Content-Type=image/png" --body "@public/icons/icon-192x192.png" || echo "Warning: Failed to upload logo. Please check permissions."
else
    echo "Warning: public/icons/icon-192x192.png not found, skipping logo upload."
fi

# 4. Add Owners
echo ""
echo "The user currently logged in to Azure CLI is automatically assigned as the Application Owner."
echo "If you wish to configure additional owners, you can do so via the Microsoft Entra ID Portal."

# 5. Add API Permissions
echo ""
echo "Adding API Permissions..."

# Azure Service Management -> user_impersonation
echo "Adding: Azure Service Management -> user_impersonation..."
az ad app permission add \
    --id "$CLIENT_ID" \
    --api 797f4846-ba00-4fd7-ba43-dac1f8f63013 \
    --api-permissions 41094075-9dad-400e-a0bd-54e686782033=Scope

# Microsoft Graph -> User.Read
echo "Adding: Microsoft Graph -> User.Read..."
az ad app permission add \
    --id "$CLIENT_ID" \
    --api 00000003-0000-0000-c000-000000000000 \
    --api-permissions e1fe6dd8-ba31-4d61-89e7-88639da4683d=Scope

# 6. Create Client Secret
echo ""
echo "Creating Client Secret..."
SECRET_JSON=$(az ad app credential reset \
    --id "$CLIENT_ID" \
    --display-name "Clerk Client Secret" \
    --years 2 \
    --query "password" \
    -o tsv)

CLIENT_SECRET="$SECRET_JSON"

echo "=========================================================="
echo "                   SETUP COMPLETED"
echo "=========================================================="
echo "Configure these values in your Clerk Dashboard under"
echo "Microsoft Social Connection (Use Custom Credentials):"
echo ""
echo "  Tenant ID (Microsoft): $TENANT_ID"
echo "  Client ID (App ID):    $CLIENT_ID"
echo "  Client Secret:         $CLIENT_SECRET"
echo ""
echo "----------------------------------------------------------"
echo "Admin Consent Instructions:"
echo "Since the app uses user_impersonation, you must grant admin consent."
echo "You can do this by running the following command:"
echo "  az ad app permission admin-consent --id $CLIENT_ID"
echo "=========================================================="
