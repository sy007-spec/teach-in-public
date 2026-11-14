"""Register a dedicated course-content OIDC client; never print operator credentials."""
import argparse,json,pathlib,urllib.request,urllib.error,urllib.parse
p=argparse.ArgumentParser()
p.add_argument('--issuer',required=True)
p.add_argument('--origin',required=True)
p.add_argument('--operator-token-file',required=True)
p.add_argument('--output',required=True)
a=p.parse_args()
for value in (a.issuer,a.origin):
    u=urllib.parse.urlparse(value)
    if u.scheme!='https' or u.username or u.password or u.path not in ('','/') or u.query or u.fragment:
        raise SystemExit('HTTPS origins without credentials required')
issuer=a.issuer.rstrip('/');origin=a.origin.rstrip('/')
secret=pathlib.Path(a.operator_token_file).read_text().strip()
def api(path,data):
    req=urllib.request.Request(issuer+path,data=json.dumps(data).encode(),headers={'Authorization':'Bearer '+secret,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError('Identity API failed: HTTP '+str(e.code)) from None
projects=api('/management/v1/projects/_search',{'query':{'limit':100}}).get('result',[])
project=next((x for x in projects if x['name']=='TeachInPublic Content Access'),None)
pid=project['id'] if project else api('/management/v1/projects',{'name':'TeachInPublic Content Access','projectRoleAssertion':False,'projectRoleCheck':False,'hasProjectCheck':False})['id']
apps=api('/management/v1/projects/'+pid+'/apps/_search',{'query':{'limit':100}}).get('result',[])
name='Content '+urllib.parse.urlparse(origin).hostname
app=next((x for x in apps if x['name']==name),None)
callback=origin+'/api/content-access/callback'
if app:
    if app['oidcConfig'].get('redirectUris')!=[callback]:raise SystemExit('Existing application callback differs; not overwritten')
    client=app['oidcConfig']['clientId']
else:
    result=api('/management/v1/projects/'+pid+'/apps/oidc',{'name':name,'redirectUris':[callback],'responseTypes':['OIDC_RESPONSE_TYPE_CODE'],'grantTypes':['OIDC_GRANT_TYPE_AUTHORIZATION_CODE'],'appType':'OIDC_APP_TYPE_WEB','authMethodType':'OIDC_AUTH_METHOD_TYPE_NONE','postLogoutRedirectUris':[origin+'/'],'version':'OIDC_VERSION_1_0','devMode':False,'idTokenUserinfoAssertion':True})
    client=result['clientId']
config={'issuer':issuer,'clientId':client}
destination=pathlib.Path(a.output)
if destination.exists() and json.loads(destination.read_text())!=config:raise SystemExit('Existing configuration differs; not overwritten')
destination.parent.mkdir(parents=True,exist_ok=True)
destination.write_text(json.dumps(config));destination.chmod(0o600)
print(json.dumps({'configured':True,'callback':callback,'projectId':pid}))

