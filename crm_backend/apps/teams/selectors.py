from .models import Team


def get_all_teams():
    return Team.objects.prefetch_related('members').filter(is_active=True)


def get_team_by_id(team_id):
    return Team.objects.prefetch_related('members').get(pk=team_id)
