from rest_framework.exceptions import APIException
from rest_framework import status


class ServiceException(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'A service error occurred.'
    default_code = 'service_error'


class IntegrationException(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'Telephony integration error.'
    default_code = 'integration_error'
