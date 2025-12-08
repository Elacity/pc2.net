import{K as ne}from"./chunk-G2RSELDM-BJQ38Zrg.js";import{j as ae}from"./loginAccount-26B5XW5Y-DsThc5Zc.js";import{d as R}from"./chunk-YNAB6HVU-BGpfhBaG.js";import{p as ie}from"./chunk-TT34D6R6-C4wbIjyL.js";import{aw as ce,$ as se,an as le,b6 as de,am as ue,r as c,ap as pe,Y as me,a0 as m,at as ge,ba as ve,bb as ye,a4 as r,a5 as he,aD as fe,aE as xe,ao as $,b8 as be,bc as _e,bd as we,be as Ce,aC as L,bf as Ee,av as g,aG as ke}from"./index-BVGkGkHn.js";import{u as Ne}from"./index-BERUD3t3.js";import{u as f}from"./useRequest-Dni9FfNw.js";import{N as Te}from"./throttle-8ytPQ63V.js";import"./chunk-PHADJY2T-D_t9dYeO.js";import"./index-HMFdnLUS.js";var Se=`.set-viery-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  overflow: auto;
  color: var(--text-color);
}
.set-viery-container .footer-box {
  position: absolute;
  bottom: 10px;
  margin: 0;
}
@media only screen and (max-height: 520px) {
  .set-viery-container .footer-box {
    position: unset;
    bottom: 0;
    margin-top: 20px;
    margin-bottom: 10px;
  }
}
.set-viery-container .display-none {
  display: none;
}
.set-viery-container .error-tip {
  width: 90%;
  height: 0;
  padding-left: 10px;
  margin-top: 6px;
  margin-bottom: 0;
  text-align: left;
  color: red;
  opacity: 0;
  transition: all 0.3s;
}
.set-viery-container .error-tip.show {
  height: 30px;
  opacity: 1;
}
.set-viery-container .set-email-title {
  margin-top: 60px;
  font-size: 22px;
  color: var(--text-color);
}
.set-viery-container .patment-tips1 {
  width: 80vw;
  margin-top: 30px;
  font-size: 14px;
  text-align: center;
  color: var(--text-color);
}
@media (min-width: 600px) {
  .set-viery-container .patment-tips1 {
    width: calc(80 * var(--vw));
  }
}
.set-viery-container .set-email-buttons {
  position: absolute;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
  height: auto;
  padding-bottom: 20px;
}
.set-viery-container .success-icon {
  width: 50px;
  height: 50px;
  margin-top: 60px;
}
.set-viery-container .set-email-desc-1 {
  box-sizing: border-box;
  padding: 0 18px;
  margin: 15px 0 25px;
  font-weight: 400;
  font-size: 14px;
  line-height: 16px;
  text-align: center;
  color: var(--text-color);
}
.set-viery-container .account-submit-btn {
  width: 90%;
  height: 47px;
  padding: 0;
  margin-top: 38px;
  border: none;
  border-radius: var(--primary-btn-border-radius);
  font-weight: 500;
  font-size: var(--primary-btn-font-size);
  line-height: 47px;
  text-align: center;
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
  opacity: 1;
}
.set-viery-container .account-submit-btn:hover {
  border: none;
  color: var(--primary-btn-color) !important;
  background: var(--primary-btn-background-color) !important;
  opacity: var(--hover-opacity);
}
.set-viery-container .account-switch-item {
  margin-top: 40px;
  font-weight: 500;
  font-size: 13px;
  line-height: 19px;
  color: var(--accent-color);
  cursor: pointer;
}
.set-viery-container .set-email-desc-2 {
  min-width: 116px;
  height: 23px;
  padding: 0 15px;
  margin: 20px 0 28px;
  border-radius: var(--primary-btn-border-radius);
  font-weight: 400;
  font-size: 12px;
  line-height: 23px;
  text-align: center;
  color: var(--secondary-text-color);
  background: var(--tag-background-color);
  opacity: 1;
}
.set-viery-container .back {
  display: flex;
  align-items: center;
  margin-top: 90px;
  font-weight: 400;
  font-size: 16px;
  line-height: 19px;
  color: var(--accent-color);
  opacity: 1;
  cursor: pointer;
  gap: 8px;
}
.set-viery-container .back svg {
  position: relative;
  top: -1px;
  color: var(--accent-color);
}
.set-viery-container .code-error {
  position: absolute;
  left: calc((100vw - 316px) / 2);
  margin-top: 224px;
  font-weight: 400;
  font-size: 12px;
  color: var(--error-color);
}
@media (min-width: 600px) {
  .set-viery-container .code-error {
    left: calc((var(--vw) * 100 - 316px) / 2);
  }
}
.set-viery-container .send-again {
  margin-top: 20px;
  border: none !important;
  outline: none !important;
  font-weight: 400;
  font-size: 16px;
  line-height: 19px;
  color: var(--text-color);
  background-color: transparent;
  box-shadow: none;
}
.set-viery-container .send-again:hover {
  color: var(--text-color) !important;
  background-color: transparent !important;
}
.set-viery-container .send-again:disabled {
  opacity: 0.5;
}
`,Ae=P=>{let l=ce(),{t}=se(),U=P,x=le(),{customRouter:O}=de(),{themeType:j,language:D}=ue(),{account:s,pageType:u,authType:i,verifyToken:J,redirectUrl:K,password:Z}=U,[b,q]=c.useState(""),[N,_]=c.useState(1e3),[v,w]=c.useState(60),[C,d]=c.useState(),{authCoreModal:T}=pe(),{userInfo:F}=me(),[G,S]=c.useState(!1),A=c.useRef(null);Ne(()=>{if(v>0){let e=v-1;w(e),e===0&&_(void 0)}},N);let{run:z}=f(async e=>u==="bind_login_account"?(e={[i]:s,cf_turnstile_response:e.cf_turnstile_response},be(e).then(n=>n)):_e(e.verifyCodeMethod),{manual:!0,onSuccess:(e,n)=>{N||(w(60),_(1e3))},onError:e=>{w(0),_(void 0)}}),{runAsync:M}=f(we,{manual:!0,onBefore:()=>{S(!0)},onError:e=>{(e==null?void 0:e.error_code)===g.InvalidCode?d(t("login.invalid_code")):(e==null?void 0:e.error_code)===g.ResendCode?d(t("login.please_send_again")):e.message&&x.error(e.message)},onFinally:()=>{setTimeout(()=>{S(!1)},2e3)}}),{loading:Q,runAsync:V}=f(async e=>Ce(e).then(async()=>{await L()}),{manual:!0,onSuccess:e=>{x.success(t("new.bind_login_account_success"))},onError:e=>{var n;let o=e.message;if((e==null?void 0:e.error_code)===g.InvalidCode){d(t("login.invalid_code"));return}else if((e==null?void 0:e.error_code)===g.ResendCode){d(t("login.please_send_again"));return}else e.error_code===20109?o=i==m.email?t("error.server_email_20109"):t("error.server_phone_20109"):o=((n=e==null?void 0:e.extra)==null?void 0:n[0])||e.message;ke.error({title:o,wrapClassName:"auth-core-modal-error",getContainer:()=>T.rootBody,onOk:()=>{var a;(a=A.current)==null||a.clear(),e.error_code===20109&&l(-1)}})}}),{loading:Y,run:H}=f(Ee,{manual:!0,onError:e=>{(e==null?void 0:e.error_code)===g.InvalidCode?d(t("login.invalid_code")):(e==null?void 0:e.error_code)===g.ResendCode&&d(t("login.please_send_again"))},onSuccess:(e,n)=>{L();let o=["account/security","solana/sign","evm-chain/sign"],a=o.map(k=>{var p;return(p=O.history)==null?void 0:p.findIndex(h=>h.path===k)}),E=a.indexOf(Math.max(...a));l(o[E],{replace:!0,back:!0})}}),{loading:W}=f(()=>new Promise((e,n)=>{}),{manual:!0,onSuccess:e=>{}}),y=c.useMemo(()=>s!=null&&s.includes("@")?m.email:m.phone,[s]);c.useEffect(()=>{I()},[s]);let I=()=>{d(""),u==="bind_login_account"&&i===m.phone?ge({theme:j,language:D,getContainer:()=>T.rootBody}).then(e=>{z({verify_code_method:y,cf_turnstile_response:e})}).catch(()=>{x.error(t("error.server_20112")),l(-1)}):z({verifyCodeMethod:y})},X=e=>{d(""),q(e),e.length===6&&ee(e)},ee=c.useCallback(Te(e=>{B(e)},1e3,{leading:!0,trailing:!1}),[]),te=e=>{H({password:Z,verifyCodeMethod:y,code:e||b})},B=(e="")=>{if(C)return;let n={code:e};u==="reset_payment_password"?te(e):u=="verify_security_account_set_security_account"?M({verifyCodeMethod:y,code:e}).then(o=>{l("/account/bind",{replace:!0,state:{accountType:i,verifyToken:o,redirectUrl:K}})}):u==="verify_security_account_bind_login_account"?M({verifyCodeMethod:y,code:e}).then(o=>{let a=ae({userInfo:F,t}),{id:E,value:k}=a.find(p=>p.type===i)||{};if(i===m.phone||i===m.email||k||E)l("/login-account/bind",{state:{authType:i,verifyToken:o},replace:!0});else{let p=ve.encode(JSON.stringify({verifyToken:o,purpose:"bindLoginAccount"}));ye({authType:i,appState:p,prompt:"select_account"}).catch(h=>{x.error((h==null?void 0:h.message)||h)})}}):u==="bind_login_account"&&(n={...n,security_account_verify_token:J,[i]:s},V(n).then(o=>{l(-2)}))},oe=()=>s.includes("@")?fe(s):xe(s);c.useEffect(()=>{var e;let n=document.getElementsByClassName("react-input-code"),o=a=>a.preventDefault();return(e=n[0])==null||e.addEventListener("contextmenu",o),()=>{var a;(a=n[0])==null||a.removeEventListener("contextmenu",o)}},[]);let re=()=>{var e;(e=document.getElementsByClassName("input-code-item")[Math.min(b.length,5)])==null||e.focus()};return r.createElement("div",{className:"set-viery-container"},r.createElement("style",null,he(Se)),r.createElement("div",{className:"account-header"},r.createElement(R,{className:"icon-navigation-back",name:"circle_back",onClick:()=>{l(-1)}})),r.createElement("h2",{className:"set-email-title"},t("account.enter_code")),r.createElement("p",{className:"set-email-desc-2"},oe()),r.createElement("div",{onClick:re},r.createElement(ne,{containerClassName:"react-input-code",inputClassName:"input-code-item",allowedCharacters:"numeric",length:6,ref:A,placeholder:" ",onChange:X})),C&&r.createElement("div",{className:"code-error"},C),r.createElement($,{className:"account-submit-btn",loading:Y||G||Q||W,onClick:()=>{setTimeout(()=>{B(b)})},disabled:b.length!==6},t("common.confirm")),r.createElement($,{className:"send-again",onClick:I,disabled:v>0},v>0?`${t("login.send_again")} (${v}s)`:t("login.send_again")),r.createElement("div",{className:"back",onClick:()=>{l(-1)}},r.createElement(R,{className:"arrow1-icon",name:"arrow1_icon"}),r.createElement("span",null,t("login.back"))),r.createElement(ie,null))},je=Ae;export{je as default};
