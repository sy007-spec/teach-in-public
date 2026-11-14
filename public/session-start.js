// Start identity lookup while the module graph downloads. Keep it in memory only.
window.trainingInitialSession=fetch('/api/session'+(new URLSearchParams(location.search).get('merchant')?'?merchant='+encodeURIComponent(new URLSearchParams(location.search).get('merchant')):''),{credentials:'same-origin',cache:'no-store'})
 .then(response=>response.ok?response.json():null).catch(()=>null);
