import{C as v}from"./chunk-PHADJY2T-CmPoQ4kq.js";import{d as u}from"./chunk-YNAB6HVU-CEwbjBrt.js";import{p as g}from"./chunk-TT34D6R6-L6WQbq6J.js";import{$ as h,aw as f,ay as x,am as w,a4 as t,r as y,a5 as _,aI as E,aJ as N}from"./index-Da1B_bQX.js";import{u as b}from"./useRequest-BKPiX46F.js";import{z}from"./dayjs.min-DZQKMTaU.js";import"./index-DWJUcTgy.js";import"./throttle-CV9_TlMb.js";var k=`.device-list-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  color: var(--text-color);
}
.device-list-container .scroll-wrapper {
  flex: 1;
  overflow: auto;
}
.device-list-container .devices-description {
  margin: 32px 18px 40px;
  font-weight: 400;
  font-size: 13px;
  color: var(--secondary-text-color);
}
.device-list-container .ant-spin-nested-loading > div > .ant-spin {
  top: 10vh;
}
.device-list-container .device-list {
  width: 100%;
  padding: 0 18px;
}
.device-list-container .device-list .ant-skeleton-content .ant-skeleton-title {
  display: none;
}
.device-list-container .device-list .item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 70px;
  padding: 0 12px 0 14px;
  margin-bottom: 10px;
  border-radius: var(--card-border-radius);
  background: var(--card-unclickable-background-color);
  cursor: pointer;
}
.device-list-container .device-list .item .device {
  font-weight: 500;
  font-size: 14px;
}
.device-list-container .device-list .item .created_at {
  margin-top: 4px;
  font-weight: 400;
  font-size: 12px;
  line-height: 1.2;
  color: var(--secondary-text-color);
}
.device-list-container .device-list .item .right {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}
.device-list-container .device-list .item .right .arrow-right-icon {
  color: var(--text-color);
}
.device-list-container .device-list .item .right .arrow-right-icon svg {
  width: 12px;
  height: 12px;
}
.device-list-container .device-list .item .right .current-icon {
  position: relative;
  height: 20px;
  padding: 0 10px;
  border-radius: 30px;
  overflow: hidden;
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  color: var(--accent-color);
}
.device-list-container .device-list .item .right .current-icon::after {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--accent-color);
  opacity: 0.15;
  content: '';
}
`,D=()=>{let{t:a}=h(),l=f(),{modalOptions:r}=x(),{language:s}=w(),{loading:d,data:n=[],run:p}=b(()=>N().then(i=>i.map(e=>{var o,c;if(e.updated_at&&(e.updated_at=z(new Date(e.updated_at)).format("YYYY/MM/DD HH:mm")),(r.projectId===e.project_app_uuid||r.appId===e.project_app_uuid)&&(e.isCurrent=!0),e.login_channel&&(e.login_channel=e.login_channel.replace(/( |^)[a-z]/g,m=>m.toUpperCase())),(o=e==null?void 0:e.location)!=null&&o.country_code)try{e.location.country_name=new Intl.DisplayNames([s||"en"],{type:"region"}).of((c=e==null?void 0:e.location)==null?void 0:c.country_code)}catch{}return e})),{cacheKey:"getAuthorizations",manual:!0});return y.useEffect(()=>{p()},[]),t.createElement("div",{className:"device-list-container"},t.createElement("style",null,_(k)),t.createElement(v,{displayBackBtn:!0},a("new.authorization")),t.createElement("div",{className:"scroll-wrapper"},t.createElement("div",{className:"devices-description"},a("new.authorization_tips")),d?t.createElement("div",{className:"device-list"},t.createElement(E,null)):t.createElement("div",{className:"device-list"},n==null?void 0:n.map((i,e)=>t.createElement("div",{className:"item",key:e,onClick:()=>{l("/manageDevices/deviceDetails",{state:{loginDeviceInfo:i}})}},t.createElement("div",{className:"left"},t.createElement("div",{className:"wrap"},t.createElement("div",{className:"s-row device"},i.project_app_name),t.createElement("div",{className:"s-row created_at"},i.updated_at))),t.createElement("div",{className:"right"},i.isCurrent&&t.createElement("div",{className:"current-icon"},a("new.current")),t.createElement(u,{className:"arrow-right-icon",name:"arrow_right_icon"})))))),t.createElement(g,{className:"footer-box-v2"}))},M=D;export{M as default};
