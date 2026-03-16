from rest_framework.response import Response
from rest_framework import status


class CreateModelMixin:
    """Return 201 with created instance data."""
    def perform_create_response(self, serializer):
        instance = serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class SoftDeleteMixin:
    """Soft-delete support — sets is_active=False instead of deleting."""
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)
