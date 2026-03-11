function t(r){return Array.isArray(r)?r:Array.isArray(r?.items)?r.items:[]}function e(r){return typeof r?.total=="number"?r.total:t(r).length}export{e as a,t as r};
