import type { StyleSpecification } from 'maplibre-gl';
export async function resolveMapSources(style: StyleSpecification, signal: AbortSignal) {
  await Promise.all(['dem', 'world'].map(async id => {
    const source = style.sources[id];
    if (!source || !['vector','raster','raster-dem'].includes(source.type) || !('url' in source) || !source.url) return;
    const label = id === 'dem' ? 'DEM高程' : '矢量底图';
    const metadataUrl = new URL(source.url, window.location.origin);
    let response: Response;
    try { response = await fetch(metadataUrl, {signal: AbortSignal.any([signal, AbortSignal.timeout(22_000)]), cache: 'no-store'}); }
    catch(error) { if(signal.aborted)throw error;throw new Error(label+'元数据请求超时或网络中断；请检查服务器出站HTTPS和地图代理日志。'); }
    if (!response.ok) throw new Error(label+'元数据 HTTP '+response.status+'：'+(response.status===401?'登录或地图令牌过期，请重新登录':response.status===502?'服务器访问上游地图失败，请检查出站网络':'请检查反向代理及服务日志'));
    const metadata = await response.json();
    if (!Array.isArray(metadata.tiles) || !metadata.tiles.length) throw new Error(label+'元数据缺少瓦片地址。');
    const tiles = metadata.tiles.map((url: string) => new URL(url, metadataUrl).href.replace(/%7B(z|x|y|-y|ratio|s)%7D/giu, '{$1}'));
    const {url: _url, ...settings} = source;void _url;
    style.sources[id] = {...settings, tiles, minzoom: metadata.minzoom ?? 0, maxzoom: metadata.maxzoom ?? (id === 'dem' ? 12 : 14), ...(metadata.bounds ? {bounds: metadata.bounds} : {}), ...(source.type !== 'raster-dem' && metadata.scheme ? {scheme: metadata.scheme} : {})} as StyleSpecification['sources'][string];
  }));
  return style;
}
