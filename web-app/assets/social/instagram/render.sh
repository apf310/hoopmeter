#!/bin/sh
# Genera las 7 diapositivas (1080×1350) del carrusel con Chrome sin interfaz. Uso: sh render.sh
cd "$(dirname "$0")"
C="/c/Program Files/Google/Chrome/Application/chrome.exe"; W=$(pwd -W)
mkdir -p out
for n in 1 2 3 4 5 6 7; do
  "$C" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --virtual-time-budget=6000 \
    --window-size=1080,1350 --screenshot="$W/out/hoopmeter-$n.png" "file:///$W/carousel.html#$n" 2>/dev/null &
done
wait
ls out
