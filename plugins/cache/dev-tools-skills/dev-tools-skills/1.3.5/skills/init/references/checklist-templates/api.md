# API Checklist Template

> This is a template file used by init skill to generate docs/checklist/api.md when explicitly requested.
> This template only allows output of API information actually scanned from source code, routes, controllers, or network layers.

---

# API Checklist

> This document only records API interfaces, service definitions, or route entries that actually exist in the project, for reference during AI development.

## Generation Rules

- Only record interfaces scanned from Retrofit, Dio, Express, NestJS, FastAPI, Flask, Django, Spring Controller, gRPC definitions, or other real network layer code
- Methods, paths, interface names, and source locations must come from real code
- Do not write example interfaces
- If request parameters or response structures cannot be reliably extracted, only record interface signature and source location
- If the project does not have a unified interface definition file, organize by network class, route file, or request wrapper class
- The following fields are only allowed when directly verifiable from code or configuration: BASE_URL, description, auth, request parameters, return type
- Fields that cannot be verified must be omitted; placeholder text is not allowed

## Basic Information

- Optional BASE_URL: {BASE_URL}
- Source files:
  - {SOURCE_FILE}
  - {SOURCE_FILE}

## API List

### {API_GROUP}

#### {API_NAME}

- Method: {HTTP_METHOD}
- Path: {API_PATH}
- Source location: {SOURCE_FILE}

Optional fields:

- Description: {API_DESC}
- Authentication: {AUTH_TYPE}
- Request parameters: {REQUEST_PARAMS_SUMMARY}
- Return type: {RESPONSE_TYPE}

## Update Rules

- Update when adding new interfaces
- Clean up promptly when deleting or migrating interfaces
- Only record real verifiable content
