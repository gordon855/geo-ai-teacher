#!/usr/bin/env bash
set -Eeuo pipefail

for command in curl python3 mktemp; do command -v "$command" >/dev/null || { echo "缺少命令：$command"; exit 1; }; done
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT

dem="${MAP_DEM_TILEJSON_URL:-https://tiles.mapterhorn.com/tilejson.json}"
vector="${MAP_VECTOR_TILEJSON_URL:-https://tiles.openfreemap.org/planet/latest}"
[[ "$vector" != "https://tiles.openfreemap.org/planet" && "$vector" != "https://tiles.openfreemap.org/planet/" ]] || vector="https://tiles.openfreemap.org/planet/latest"

for value in "$dem" "$vector"; do
  [[ "$value" == https://* ]] || { echo "检测到本地地图配置 $value；请由管理员单独核对该地址。"; exit 0; }
done

echo "检查DEM TileJSON：$dem"
curl -fsSL --max-time 20 --retry 2 --retry-delay 1 "$dem" -o "$tmp/dem.json"
echo "检查矢量 TileJSON：$vector"
curl -fsSL --max-time 20 --retry 2 --retry-delay 1 "$vector" -o "$tmp/vector.json"

python3 - "$tmp" "$dem" "$vector" <<'PY'
import json, math, pathlib, sys
from urllib.parse import urljoin

root=pathlib.Path(sys.argv[1]); sources={'dem':sys.argv[2],'vector':sys.argv[3]}
required={'water','waterway','transportation','building','place'}
for kind in ('dem','vector'):
    data=json.loads((root/f'{kind}.json').read_text())
    tiles=data.get('tiles')
    assert isinstance(tiles,list) and tiles and isinstance(tiles[0],str),f'{kind} TileJSON缺少tiles'
    if kind=='dem':
        assert data.get('encoding','terrarium') in ('terrarium','mapbox'),'DEM编码不受支持'
    else:
        layers={item.get('id') for item in data.get('vector_layers',[]) if isinstance(item,dict)}
        missing=required-layers
        assert not missing,'矢量数据缺少图层：'+','.join(sorted(missing))
    z=8; lon=112.55; lat=37.87
    x=int((lon+180)/360*(2**z))
    y=int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*(2**z))
    template=urljoin(sources[kind],tiles[0])
    url=(template.replace('{z}',str(z)).replace('{x}',str(x)).replace('{y}',str(y))
         .replace('{-y}',str((2**z)-y-1)).replace('{ratio}','').replace('{s}','a'))
    (root/f'{kind}.url').write_text(url)
print('TileJSON结构及OpenMapTiles关键图层检查通过。')
PY

for kind in dem vector; do
  url="$(cat "$tmp/$kind.url")"
  curl -fsSL --max-time 25 --retry 2 --retry-delay 1 "$url" -o "$tmp/$kind.tile"
  [[ -s "$tmp/$kind.tile" ]] || { echo "$kind 样例瓦片为空。"; exit 1; }
  echo "$kind 样例瓦片可达：$(wc -c < "$tmp/$kind.tile") bytes"
done

echo '地图上游检查通过；第19.1版会由应用服务器同源代理这些数据。'
