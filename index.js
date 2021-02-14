import yaml from 'yaml';
import fetch from 'node-fetch';
import mergeDeep from 'merge-deep';
import http from 'http';

const port = process.env.PORT || 3000;

function mergeSub(origin, addon) {
  const originConfig = yaml.parse(origin);
  const addonConfig = yaml.parse(addon);
  let result = mergeDeep(originConfig, addonConfig);

  //replace dns
  if(addonConfig.dns) {
    result.dns = addonConfig.dns;
  }

  //unshift rules
  if(addonConfig.rules) {
    result.rules = addonConfig.rules.concat(originConfig.rules);
  }

  return yaml.stringify(result);
}

http.createServer(async (request, response) => {
  const { headers, method, url } = request;
  if (method === 'GET') {

    try {
      const search = url.match(/(\?.+)$/);
      if (search === null) {
        throw new ParamInvalidError();
      }

      const param = new URLSearchParams(search[1]);
      const subUrl = param.get('sub');
      const addonUrl = param.get('addon');

      if (!subUrl || !addonUrl) {
        throw new ParamInvalidError();
      }

      const [subRes, addonRes] = await Promise.all([fetch(btoa(subUrl)), fetch(btoa(addonUrl))]);
      /* console.log(btoa(subUrl),btoa(addonUrl));
      const subRes = await fetch(btoa(subUrl));
      const addonRes = await fetch(btoa(addonUrl)); */

      if (!subRes.ok || !addonRes.ok) throw new SubFetchError();

      const originCfg = await subRes.text();
      const addonCfg = await addonRes.text();

      let originFileName = subRes.headers.get('content-disposition');
      if (originFileName) {
        originFileName.replace('.yaml', '-mixin.yaml');
      } else {
        originFileName = 'attachment; filename=mixin.yaml';
      }

      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/octet-stream; charset=UTF-8');
      response.setHeader("Content-disposition", originFileName);
      response.write(mergeSub(originCfg,addonCfg));
      response.end();

    } catch (e) {
      if (e instanceof ParamInvalidError) {
        response.statusCode = 400;
        response.write(e.message);
        response.end();
      } else {
        console.error('uncauthed error!', e);
        response.statusCode = 501;
        response.write(e.message)
        response.end();
      }
    }
  }

}).listen(port);

//Error
class ParamInvalidError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParamInvalidError';
    if (!this.message) this.message = 'param invalid! something like ?sub=[sub b64Url]&addon=[add b64Url]';
  }
}

class SubFetchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SubFetchError';
    if (!this.message) this.message = 'sub or addon fetch failed!';
  }
}

function atob(str) {
  return Buffer.from(str).toString('base64');
}

function btoa(b64) {
  return Buffer.from(b64, 'base64').toString();
}