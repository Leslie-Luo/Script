// ==UserScript==
// @name         京东Cookie手动同步青龙
// @namespace    jd_cookie_sync_ql
// @storageName  jd_cookie_sync_ql
// @version      1.0.0
// @description  手动同步京东Cookie到青龙面板
// @author       Leslie
// @run-at       document-end
// @match        https://home.m.jd.com/myJd/newhome.action*
// @match        https://m.jd.com/*
// @grant        unsafeWindow
// @grant        GM_cookie
// @grant        GM_addValueChangeListener
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_log
// @connect      jd.com
// ==/UserScript==

/* ==UserConfig==
青龙配置:
  url:
    title: 青龙面板地址
    description: '青龙面板地址,例如: http://127.0.0.1:1080'
  clientId:
    title: clientId
    description: 请在 系统设置->应用设置 添加应用,然后复制client id值
  clientSecret:
    title: clientSecret
    description: 请在 系统设置->应用设置 添加应用,然后复制client secret值
 ==/UserConfig== */

const sync = document.createElement("div");
sync.id = "sync-ck";
sync.style.position = "absolute";
sync.style.zIndex = "1000";
sync.style.padding = "10px";
sync.style.width = "100px";
sync.style.left = "calc(50% - 50px)";
sync.style.top = "200px";
sync.style.background = "aliceblue";
sync.style.color = "#000";
sync.style["text-align"] = "center";
sync.style["border-radius"] = "8px";
sync.style["font-weight"] = "bold";
sync.innerHTML = "同步cookie";

function getJDCookie() {
  return new Promise((resolve, reject) => {
    let jdCookie = "";
    GM_cookie(
      "list",
      {
        domain: ".jd.com",
        name: "pt_key",
      },
      (cookies) => {
        if (cookies.length == 0) {
          return reject();
        }
        jdCookie = "pt_key=" + cookies[0].value;
        GM_cookie(
          "list",
          {
            domain: ".jd.com",
            name: "pt_pin",
          },
          (cookies) => {
            if (cookies.length == 0) {
              return reject();
            }
            jdCookie += ";pt_pin=" + cookies[0].value + ";";
            resolve({
              jdCookie: jdCookie,
              pt_pin: decodeURI(cookies[0].value),
            });
          },
        );
      },
    );
  });
}

function ajax(method, url, token, data) {
  return new Promise((resolve, reject) => {
    let headers = {};
    if (method != "get") {
      headers["Content-Type"] = "application/json";
    }
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }
    GM_xmlhttpRequest({
      url: url,
      method: method,
      data: JSON.stringify(data),
      headers: headers,
      responseType: "json",
      onload(resp) {
        let code = resp.response.code || "unknow";
        let msg = resp.response.message || "unkonw";
        if (resp.status == 200) {
          if (code == 200) {
            resolve(resp.response);
          } else {
            reject(msg);
          }
        } else {
          reject(msg);
        }
      },
      onerror(resp) {
        reject(resp);
      },
    });
  });
}

function getQlToken() {
  GM_log("getQlToken-开始获取青龙Token");
  return new Promise(async (resolve, reject) => {
    let url = GM_getValue("青龙配置.url");
    let clientId = GM_getValue("青龙配置.clientId");
    let clientSecret = GM_getValue("青龙配置.clientSecret");
    try {
      let resp = await ajax(
        "get",
        url + "/open/auth/token?client_id=" + clientId + "&client_secret=" + clientSecret,
      );
      token = resp.data.token;
      GM_setValue("ql.token", token);
      GM_setValue("ql.expiration", resp.data.expiration);
      GM_log("getQlToken-获取青龙Token成功");
      resolve(token);
    } catch (e) {
      GM_log("getQlToken-获取青龙Token失败" + e);
      return reject(e);
    }
  });
}

function updateCk(ckName, ck, pt_pin, token) {
  return new Promise(async (resolve, reject) => {
    try {
      let url = GM_getValue("青龙配置.url");
      let resp = await ajax("get", url + "/open/envs?searchValue=" + ckName, token);
      let id = (resp.data || []).find((item) => item.name === ckName).id || "";
      if (id) {
        // 使用 Token 更新环境变量
        await ajax("put", url + "/open/envs", token, {
          name: ckName,
          value: ck,
          remarks: pt_pin + " by ScriptCat",
          id: id,
        });
        // 使用 Token 启用环境变量
        await ajax("put", url + "/open/envs/enable", token, [id]);
      } else {
        // 使用 Token 添加环境变量
        await ajax("post", url + "/open/envs", token, [
          { name: ckName, value: ck, remarks: pt_pin + " by ScriptCat" },
        ]);
      }
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

function setJDCookieToQingLong(ck, pt_pin) {
  return new Promise(async (resolve, reject) => {
    //获取青龙token
    let url = GM_getValue("青龙配置.url");
    if (!url) {
      return reject("请配置青龙地址");
    }
    let ckName = "JD_COOKIE";
    let token = GM_getValue("ql.token");
    let expiration = GM_getValue("ql.expiration");
    try {
      // token过期重新获取
      if (!token || expiration < new Date().getTime() / 1000 - 1000) {
        token = await getQlToken();
      }
      await updateCk(ckName, ck, pt_pin, token);
      resolve();
    } catch (e) {
      if (e == "UnauthorizedError") {
        try {
          token = await getQlToken();
          await updateCk(ckName, ck, pt_pin, token);
          resolve();
        } catch (e) {
          reject(e);
        }
      }
      return reject(e);
    }
  });
}

function startSync() {
  getJDCookie()
    .then((resp) => {
      let ck = resp.jdCookie;
      let pt_pin = resp.pt_pin;
      GM_setClipboard(ck);
      GM_setValue("jdck", ck);
      setJDCookieToQingLong(ck, pt_pin)
        .then((resp) => {
          GM_log("ck设置成功");
          GM_notification({
            title: "京东ck同步青龙",
            text: "以将ck复制到了剪辑版,青龙面板推送成功",
          });
        })
        .catch((e) => {
          GM_log("ck设置失败" + JSON.stringify(e), "error");
          GM_notification({
            title: "京东ck同步青龙",
            text: "以将ck复制到了剪辑版,青龙面板推送失败:" + e,
          });
        });
    })
    .catch((err) => {
      GM_log(err);
      GM_notification({
        title: "京东ck同步青龙",
        text: "京东ck获取失败,请确定是否登录",
      });
    });
}

sync.addEventListener("click", (ev) => {
  switch (ev.target.id) {
    case "sync-ck": {
      startSync();
      break;
    }
    default: {
      console.log("点击同步cookie:");
    }
  }
});

document.body.appendChild(sync);
