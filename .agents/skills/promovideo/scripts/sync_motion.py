"""Extract supported motion values from a local base-surfaces checkout."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

SOURCE = 'base-surfaces-mobile/mobile/src/styles.css'

def extract(root):
    root = Path(root)
    sources = [SOURCE] if (root/SOURCE).exists() else ['base-surfaces-mobile/mobile/src/components/'+name+'.css' for name in ('PageTransition','BottomSheet','PrototypeSettings')]
    texts = [(name,(root/name).read_text()) for name in sources]
    css = '\n'.join(text for _,text in texts)
    def block(selector):
        match = re.search(r'^'+re.escape(selector)+r'\s*\{([^}]+)\}', css, re.M)
        if not match:
            raise ValueError('Motion selector changed: '+selector)
        return match[1]
    def seconds(value, unit):
        return float(value)/(1000 if unit == 'ms' else 1)
    old = block('.page-layer--old--push.page-layer--animate')
    new = block('.page-layer--new--push')
    active = block('.page-layer--new--push.page-layer--animate')
    duration, unit, bezier = re.search(r'transform ([\d.]+)(ms|s) cubic-bezier\(([^)]+)\)',old).groups()
    opacity_duration, opacity_unit = re.search(r'opacity ([\d.]+)(ms|s) ease-out',active).groups()
    sheet = block('.wise-bottom-sheet')
    sd, su, stops, delay, du = re.search(r'transform ([\d.]+)(ms|s) linear\((.*?)\)\s*([\d.]+)(ms|s)',sheet,re.S).groups()
    points=[]
    for i,stop in enumerate(stops.split(',')):
        parts=stop.split()
        points.append([float(parts[1].rstrip('%'))/100 if len(parts)>1 else 0, float(parts[0])])
    backdrop=block('.wise-bottom-sheet__backdrop')
    bd,bu=re.search(r'background ([\d.]+)(ms|s) ease',backdrop).groups()
    dim=float(re.search(r'rgba\(0, 0, 0, ([\d.]+)\)',block('.wise-bottom-sheet__backdrop--visible'))[1])
    commit=subprocess.run(['git','-C',str(root),'rev-parse','HEAD'],capture_output=True,text=True,check=True).stdout.strip()
    result = {'source':{'repository':'https://github.com/transferwise/base-surfaces','commit':commit,'files':{name:hashlib.sha256(text.encode()).hexdigest() for name,text in texts}},
      'page':{'duration':seconds(duration,unit),'bezier':[float(v) for v in bezier.split(',')], 'parallax':abs(float(re.search(r'translateX\((-?[\d.]+)%\)',old)[1]))/100,'old_opacity':float(re.search(r'opacity: ([\d.]+)',old)[1]),'new_opacity':float(re.search(r'opacity: ([\d.]+)',new)[1]),'opacity_duration':seconds(opacity_duration,opacity_unit),'radius':float(re.search(r'border-top-left-radius: ([\d.]+)px',new)[1])},
      'sheet':{'duration':seconds(sd,su),'delay':seconds(delay,du),'points':points,'extra_travel':float(re.search(r'100% \+ ([\d.]+)px',sheet)[1]),'radius':float(re.search(r'border-radius: ([\d.]+)px',sheet)[1]),'dim':dim,'dim_duration':seconds(bd,bu)}}

    full = block('.fs-sheet')
    fd, fu, curve = re.search(r'transform ([\d.]+)(ms|s) cubic-bezier\(([^)]+)\)', full).groups()
    result['spring_sheet'] = result['sheet']
    result['sheet'] = {'duration':seconds(fd,fu), 'delay':0, 'bezier':[float(v) for v in curve.split(',')], 'extra_travel':0, 'radius':float(re.search(r'border-radius: ([\d.]+)px',full)[1]), 'dim':dim, 'dim_duration':seconds(bd,bu)}
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('checkout',type=Path)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args()
    result=extract(a.checkout)
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(result,indent=2)+'\n')
    print(a.output)
