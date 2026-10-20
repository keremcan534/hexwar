import json, numpy as np
A=json.load(open('analysis.json')); B=json.load(open('beats.json'))
FR=A['fr']; on=np.array(A['onset']); lf=np.array(A['lowflux']); hf=np.array(A['hiflux']); r=np.array(A['rms_db']); hi=np.array(A['high']); lo=np.array(A['low'])
beats=np.array(B['beats']); T0=221.96
db=set(np.round(B['downbeats'],3))
print('trailer_t  abs_t   rms   low   high  onset lowflx hiflx')
for b in beats[(beats>216)&(beats<293)]:
    i=int(b*FR); w=slice(max(0,i-3),i+4); seg=slice(i,i+int(FR*0.5))
    mark='|' if round(b,3) in db else ' '
    print(f'{b-T0:7.3f}{mark}{b:8.3f} {r[seg].mean():6.1f} {lo[seg].mean():5.2f} {hi[seg].mean():5.2f} {on[w].max():5.2f} {lf[w].max():5.2f} {hf[w].max():5.2f}  '+'*'*int(max(0,on[w].max()*10))+' '+'B'*int(max(0,lf[w].max()*6)))
