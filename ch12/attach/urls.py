from django.conf.urls.defaults import *

urlpatterns = patterns('',
    (r'^$', 'attach.attacher.views.index'),
    (r'^static/(?P<path>.*)$', 'django.views.static.serve',
     {'document_root': '/path/to/attach/media/'}),
)
