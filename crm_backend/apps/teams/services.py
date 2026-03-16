from .models import Team


def create_team(name, description='', supervisor=None):
    return Team.objects.create(name=name, description=description, supervisor=supervisor)


def update_team(team_id, **kwargs):
    Team.objects.filter(pk=team_id).update(**kwargs)
