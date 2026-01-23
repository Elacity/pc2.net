import{_ as p,V as e,v as i,w as o}from"./index-Da1B_bQX.js";var a,n,r,s,d,l,c,m,g,x,b,u,v,f,h,y,w,k,$,z,C,I,B=p({"src/components/modal/styles.ts"(){a=e`
from { opacity: 0; }
  to { opacity: 1; }
`,n=e`
from { opacity: 1; }
  to { opacity: 0; }
`,r=e`
  from{ opacity: 0; transform: scale(0.97); }
  to{ opacity: 1; transform: scale(1); }
`,s=e`
  from{ opacity: 1; transform: scale(1); }
  to{ opacity: 0; transform: scale(0.97); }
`,d=e`
  from { transform: translate3d(0, 100%, 0); }
  to { transform: translate3d(0, 0%, 0); }
`,l=e`
  from { opacity: 1; }
  to { opacity: 0; }
`,c=i.div`
  z-index: 2147483646;
  position: fixed;
  inset: 0;
`,m=i(o.div)`
  z-index: 1;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--pcm-overlay-background, rgba(71, 88, 107, 0.24));
  backdrop-filter: var(--pcm-overlay-backdrop-filter, blur(6px));
  opacity: 0;
  animation: ${t=>t.$active?a:n} 150ms ease-out both;
`,g=i(o.div)`
  --ease: cubic-bezier(0.25, 0.1, 0.25, 1);
  --duration: 200ms;
  --transition: height var(--duration) var(--ease), width var(--duration) var(--ease);
  z-index: 3;
  display: block;
  pointer-events: none;
  position: ${t=>t.$positionInside?"unset":"absolute"};
  left: 50%;
  top: 50%;
  width: 100%;
  height: auto;
  transform: ${t=>t.$positionInside?"none":"translate(-50%, -50%)"};
  backface-visibility: hidden;
  @media only screen and (max-width: 560px) {
    pointer-events: auto;
    left: 0;
    top: auto;
    bottom: -5px;
    transform: none;
  }
`,x=i(o.div)`
  z-index: 2;
  position: relative;
  color: var(--pcm-body-color, black);
  animation: 150ms ease both;
  animation-name: ${t=>t.$positionInside?null:s};
  margin: auto;
  height: var(--height);
  width: 400px;
  border-radius: var(--pcm-rounded-xl);
  background: var(--pcm-body-background);
  box-shadow: var(--pcm-modal-box-shadow);
  transition: all 300ms ease;
  overflow: hidden;
  &.active {
    animation-name: ${t=>t.$positionInside?null:r};
  }

  @media only screen and (max-width: 560px) {
    animation-name: ${t=>t.$positionInside?null:l};
    animation-duration: 130ms;
    animation-timing-function: ease;
    width: 100%;
    transition: 200ms height cubic-bezier(0.15, 1.15, 0.6, 1);
    will-change: height;
    border-bottom-left-radius: ${t=>t.$positionInside?null:0};
    border-bottom-right-radius: ${t=>t.$positionInside?null:0};

    &.active {
      animation-name: ${t=>t.$positionInside?null:d};
      animation-duration: 300ms;
      animation-delay: 32ms;
      animation-timing-function: cubic-bezier(0.15, 1.15, 0.6, 1);
    }
  }
`,b=i(o.div)`
  z-index: 2;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: auto;
`,u=i(o.div)`
  width: 100%;
  padding: 64px 0 24px 0;
  backface-visibility: hidden;
  box-sizing: border-box;
`,v=i(o.div)`
  max-width: 100%;
  margin: 0 4px 22px;
  padding: 12px 20px 8px;
  overflow-x: visible;
  max-height: var(--pcm-modal-max-height, 65vh);
  overflow-y: auto;
  opacity: 0;
  animation: ${a} 300ms ease-out both;
`,f=i(o.div)`
  z-index: 3;
  position: absolute;
  top: 0;
  left: 50%;
  height: 64px;
  transform: translateX(-50%);
  backface-visibility: hidden;
  width: 100%;
  pointer-events: auto;
`,h=i(o.button)`
  z-index: 3;
  cursor: pointer;
  position: absolute;
  top: 21px;
  left: 17px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center center;
  border-radius: 16px;
  padding: 0;
  margin: 0;
  color: var(--pcm-body-action-color);
  background: var(--pcm-body-background);
  transition: background-color 200ms ease;
  background: var(--pcm-body-background-secondary);
  border: none;
  svg {
    display: block;
    position: relative;
    left: -1px;
  }

  &:active {
    transform: scale(0.9);
    svg {
      left: 0px;
    }
  }
`,y=i(o.button)`
  z-index: 3;
  cursor: pointer;
  position: absolute;
  top: 21px;
  right: 17px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  padding: 0;
  margin: 0;
  color: var(--pcm-body-action-color);
  background: var(--pcm-body-background);
  transition: background-color 200ms ease;
  background: var(--pcm-body-background-secondary);
  border: none;
  svg {
    display: block;
  }
  &:active {
    transform: scale(0.9);
  }
`,w=i(o.div)`
  z-index: 3;
  pointer-events: none;
  user-select: none;
  position: absolute;
  top: 12px;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  transform: translateX(-50%);
  width: 100%;
  text-align: center;
  font-size: 17px;
  line-height: 20px;
  padding: 0 24px;
  font-weight: var(--pcm-modal-heading-font-weight, 600);
  color: var(--pcm-body-color);
  span {
    display: inline-block;
  }
`,k=i(o.div)`
  background: var(--pcm-error-background);
  color: var(--pcm-error-color);
  text-align: center;
  height: 28px;
  margin: 0 24px;
  line-height: 28px;
  border-radius: 30px;
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  padding: 0 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  svg {
    display: inline-block;
    margin-right: 8px;
  }
`,$=i(o.div)`
  display: ${t=>t.$display?"flex":"none"};
  width: 100%;
  margin: 16px auto;
  align-items: center;
  justify-content: center;
  opacity: 0;
  animation: ${t=>t.$display?a:n} 200ms ease-out both;
`,i(o.div)`
  position: relative;
  padding: 0;
`,z=i.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: ${t=>t.gap||0}px;
`,C=i.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: ${t=>t.gap||0}px;
`,i.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: ${t=>t.gap||0}px;
`,I=i.div`
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${t=>t.gap||0}px;
`}});export{x as B,f as C,$ as E,C as F,c as M,v as P,z as a,m as b,g as c,h as d,y as e,w as f,b as g,u as h,B as i,k as j,I as k};
