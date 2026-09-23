FROM nginx:1.27-alpine AS assets
WORKDIR /assets
COPY . .
# Build-only files must never end up in the served document root.
RUN rm -f Dockerfile nginx.conf
# Enumerate installed themes during image assembly: adding a CSS file needs no JS edit.
RUN printf '["terminal"' > themes/index.json && \
    for file in themes/*.css; do \
      name="${file##*/}"; name="${name%.css}"; \
      case "$name" in _*|terminal) continue ;; esac; \
      printf ',"%s"' "$name" >> themes/index.json; \
    done && printf ']\n' >> themes/index.json

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=assets /assets /usr/share/nginx/html
