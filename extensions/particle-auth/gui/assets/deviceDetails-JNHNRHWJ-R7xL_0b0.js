import{C as h}from"./chunk-PHADJY2T-BVIU49Tr.js";import{d as N}from"./chunk-YNAB6HVU-D07fsIHr.js";import{p as w}from"./chunk-TT34D6R6-CSYLhXsf.js";import{$ as y,aw as _,ap as k,r as p,an as C,a4 as e,a5 as j,ao as i,aG as z,aK as B}from"./index-AMRqCd9_.js";var T=`.device-details-wrapper {
  -webkit-overflow-scrolling: touch;
  height: 100%;
}
.device-details-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: auto;
  color: var(--text-color);
}
.device-details-container .scroll-wrapper {
  flex: 1;
  overflow: auto;
}
.device-details-container .details-list {
  padding: 0 18px;
  padding-bottom: 50px;
  margin-top: 20px;
}
.device-details-container .details-list .item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 58px;
  padding: 0 12px 0 14px;
  margin-bottom: 10px;
  border-radius: var(--card-border-radius);
  background: var(--card-unclickable-background-color);
}
.device-details-container .details-list .item .right {
  font-weight: 400;
  font-size: 12px;
}
.device-details-container .btns {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 0 18px;
  background: var(--theme-background-color);
}
.device-details-container .btns .confirm-delete-btn {
  width: 100%;
  max-width: 360px;
  height: 46px;
  padding: 0;
  line-height: 46px;
}
.delete-confirm-modal .ant-modal-confirm-btns,
.delete-confirm-modal .anticon-exclamation-circle {
  display: none;
}
.delete-confirm-modal .ant-modal-confirm-content {
  margin: 0 !important;
}
.delete-confirm-modal .ant-modal-body {
  position: relative;
  padding: 26px 18px;
}
.delete-confirm-modal .content-text {
  margin-top: 40px;
  margin-bottom: 34px;
  font-weight: 500;
  font-size: 20px;
  text-align: center;
  color: var(--text-color);
}
.delete-confirm-modal .close-btn {
  position: absolute;
  top: 10px;
  right: 16px;
  font-size: 30px;
}
.delete-confirm-modal .btns {
  display: flex;
  gap: 20px;
  justify-content: space-between;
}
.delete-confirm-modal .btns button {
  flex: 1;
  height: 46px;
}
.delete-confirm-modal .btns button.cancel-btn {
  color: var(--text-color);
  background: var(--secondary-btn-background-color);
}
@media (max-width: 767px) {
  .delete-confirm-modal .ant-modal {
    max-width: calc(100vw - 36px);
    margin: 8px auto;
  }
}
`,M=v=>{var c,o,r,s;let{loginDeviceInfo:t}=v,{t:a}=y(),f=_(),{authCoreModal:u}=k(),[g,d]=p.useState(!1),[x,m]=p.useState(!1),E=()=>{d(!0)},b=C(),l=()=>{d(!1)};return e.createElement("div",{className:"device-details-wrapper"},e.createElement("style",null,j(T)),e.createElement("div",{className:"device-details-container"},e.createElement(h,{displayBackBtn:!0},a("new.details")),e.createElement("div",{className:"scroll-wrapper"},e.createElement("div",{className:"details-list"},e.createElement("div",{className:"item"},e.createElement("div",{className:"left"},a("new.app")),e.createElement("div",{className:"right"},t.project_app_name||"-")),e.createElement("div",{className:"item"},e.createElement("div",{className:"left"},a("new.device")),e.createElement("div",{className:"right"},t.device||"-")),e.createElement("div",{className:"item"},e.createElement("div",{className:"left"},a("new.authorized_time")),e.createElement("div",{className:"right"},t.updated_at||"-")),e.createElement("div",{className:"item"},e.createElement("div",{className:"left"},a("new.login_method")),e.createElement("div",{className:"right"},(t.login_channel||"-").replace("Twitterv1","Twitter"))),e.createElement("div",{className:"item"},e.createElement("div",{className:"left"},a("new.ip")),e.createElement("div",{className:"right"},((c=t==null?void 0:t.location)==null?void 0:c.ip)||"-")),e.createElement("div",{className:"item"},e.createElement("div",{className:"left"},a("new.country")),e.createElement("div",{className:"right"},((o=t==null?void 0:t.location)==null?void 0:o.country_name)||((r=t==null?void 0:t.location)==null?void 0:r.country_code)||"-")),e.createElement("div",{className:"item"},e.createElement("div",{className:"left"},a("new.city")),e.createElement("div",{className:"right"},((s=t==null?void 0:t.location)==null?void 0:s.city)||"-")))),e.createElement("div",{className:"btns"},e.createElement(i,{className:"still-confirm confirm-delete-btn",disabled:t.isCurrent,onClick:()=>{E()}},a("new.delete_access"))),e.createElement(z,{className:"delete-confirm-modal",open:g,closable:!1,footer:null,centered:!0,getContainer:()=>u.rootBody},e.createElement("div",{className:"content-wrap"},e.createElement("div",{className:"close-btn",onClick:()=>{l()}},e.createElement(N,{className:"circle_close",name:"circle_close"})),e.createElement("div",{className:"content-text"},a("new.delete_access_to_n").format(t==null?void 0:t.project_app_name,t==null?void 0:t.device)),e.createElement("div",{className:"btns"},e.createElement(i,{className:"cancel-btn",onClick:()=>{l()}},a("common.cancel")),e.createElement(i,{className:"still-confirm delete-btn",loading:x,onClick:()=>{m(!0),setTimeout(()=>{B(t==null?void 0:t.project_app_uuid).finally(()=>{m(!1)}).then(n=>{n&&(l(),setTimeout(()=>{f(-1)},500))}).catch(n=>{b.error(n.message)})},500)}},a("new.delete"))))),e.createElement(w,{className:"footer-box-v2"})))},$=M;export{$ as default};
