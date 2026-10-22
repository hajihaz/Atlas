#!/usr/bin/env python3
"""Read-only NSE IPO research snapshot. No orders, credentials or anti-bot bypasses.

Undocumented exchange website endpoints can change; fail closed on schema/network errors.
Follow the exchange's applicable access/data licensing terms before unattended redistribution.
"""
from __future__ import annotations
import argparse
from html.parser import HTMLParser
from datetime import timedelta, date
from datetime import datetime, timezone
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = 'https://www.nseindia.com'
LIST_URL = BASE + '/api/all-upcoming-issues?category=ipo'
DETAIL_URL = BASE + '/api/ipo-detail?symbol='
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / 'frontend/public/ipo-feed.json'
HEADERS = {'Accept': 'application/json', 'User-Agent': 'Atlas IPO Research (read-only; contact repository maintainers)'}

def get_json(url: str, timeout: int = 9):
    # No retry storms, no browser impersonation, no rate-limit/geo-control bypass.
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status != 200 or 'json' not in response.headers.get('content-type','').lower():
            raise ValueError('Unexpected NSE response type')
        return json.load(response)

def date_iso(text):
    try:
        return datetime.strptime(text, '%d-%b-%Y').date().isoformat()
    except (TypeError, ValueError):
        return None

def as_number(value):
    try:
        result = float(str(value).replace(',', ''))
        if result != result or abs(result) == float('inf') or result < 0:
            return None
        return round(result, 4)
    except (ValueError, TypeError):
        return None

def price_band(text):
    values = [float(x.replace(',', '')) for x in re.findall(r'\d[\d,]*(?:\.\d+)?', str(text))]
    return (min(values), max(values)) if values and len(values) <= 2 else (None, None)

def summary_categories(data):
    result = {'qib':None, 'nii':None, 'retail':None, 'individual':None, 'total':None}
    for row in data if isinstance(data,list) else []:
        label = str(row.get('category') or '').lower()
        number = as_number(row.get('noOfTime'))
        if number is None: continue
        if label.strip()=='total': result['total']=number
        elif label.startswith('qualified institutional'): result['qib']=number
        elif label=='non institutional investors': result['nii']=number
        elif label.startswith('retail individual'): result['retail']=number
        elif label.startswith('individual investors'): result['individual']=number
    return result

def transform_issue(item):
    if not isinstance(item, dict): return None
    symbol=str(item.get('symbol') or '').strip().upper()
    company=str(item.get('companyName') or '').strip()
    start=date_iso(item.get('issueStartDate'))
    end=date_iso(item.get('issueEndDate'))
    if not re.fullmatch(r'[A-Z0-9-]{2,30}', symbol) or not company or not start or not end or end < start:
        return None
    board='SME' if str(item.get('series','')).upper()=='SME' else 'MAINBOARD' if str(item.get('series','')).upper()=='EQ' else None
    if board is None: return None
    minimum, maximum=price_band(item.get('issuePrice'))
    status=str(item.get('status') or '').lower()
    if 'active' in status: status='OPEN'
    elif 'forthcoming' in status or 'upcoming' in status: status='UPCOMING'
    elif 'closed' in status: status='CLOSED'
    else: status='UNKNOWN'
    return {'id':symbol,'company':company[:180], 'board':board,'openDate':start,'closeDate':end,
        'status':status,'priceMin':minimum,'priceMax':maximum,'lotSize':None,
        'subscription':{'qib':None,'nii':None,'retail':None,'individual':None,'total':None},
        'gmp':None,'gmpAsOf':None,'financials':None,'news':[],
        'detailSource':BASE+'/market-data/issue-information?symbol='+urllib.parse.quote(symbol),
        'source':LIST_URL,'mandateDeadline':None,'bidDeadline':None}

def parse_mandate_deadline(raw):
    match=re.search(r'(\d{2}-[A-Za-z]{3}-\d{4}).{0,50}?(?:upto|up to)\s*(\d{1,2}):(\d{2})\s*(AM|PM)',str(raw),re.I)
    if not match:return None
    day=date_iso(match.group(1))
    if not day:return None
    hour=int(match.group(2))%12 + (12 if match.group(4).upper()=='PM' else 0)
    minute=int(match.group(3))
    if hour>23 or minute>59:return None
    return f'{day}T{hour:02d}:{minute:02d}:00+05:30'

def enrich_detail(issue):
    detail=get_json(DETAIL_URL+urllib.parse.quote(issue['id']),timeout=7)
    if not isinstance(detail,dict): return
    issue['subscription']=summary_categories(detail.get('bidDetails'))
    listing=detail.get('issueInfo') or {}
    rows=listing.get('dataList') if isinstance(listing,dict) else []
    for x in rows if isinstance(rows,list) else []:
        if not isinstance(x,dict):continue
        title=str(x.get('title') or '').strip().lower()
        value=str(x.get('value') or '')
        if 'cut-off time for upi mandate' in title:
            issue['mandateDeadline']=parse_mandate_deadline(value)
        if title in ('bid lot','market lot','bid lot size'):
            match=re.search(r'\d[\d,]*',value)
            if match:issue['lotSize']=int(match.group().replace(',',''))
    # Individual IPO cutoffs can differ from generalized exchange windows.
    # No inferred exact bid or mandate deadline is published.

BSE_SME_URL = 'https://www.bsesme.com/PublicIssues/PublicIssues.aspx?id=2'

class BseSmeTable(HTMLParser):
    """Extract only the BSE SME Public Issues grid; never infer prices or applications."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.inside = False
        self.in_row = False
        self.in_cell = False
        self.cells = []
        self.rows = []
        self.href = None
        self.row_href = None
        self.text = ''

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'table' and attrs.get('id') == 'ContentPlaceHolder1_tblID':
            self.inside = True
        elif self.inside and tag == 'tr':
            self.in_row = True
            self.cells = []
            self.row_href = None
        elif self.in_row and tag in ('td', 'th'):
            self.in_cell = True
            self.text = ''
        elif self.in_cell and tag == 'a':
            self.row_href = attrs.get('href') or self.row_href

    def handle_data(self, data):
        if self.in_cell:
            self.text += data

    def handle_endtag(self, tag):
        if self.in_cell and tag in ('td', 'th'):
            self.cells.append(' '.join(self.text.split()))
            self.in_cell = False
        elif self.in_row and tag == 'tr':
            if len(self.cells) >= 4 and self.row_href:
                self.rows.append((self.cells, self.row_href))
            self.in_row = False
        elif self.inside and tag == 'table':
            self.inside = False

def recent_bse_sme(now=None, html_text=None):
    if html_text is None:
        request=urllib.request.Request(BSE_SME_URL,headers={'User-Agent':'Atlas IPO Research (read-only)'})
        with urllib.request.urlopen(request,timeout=10) as response:
            if response.status!=200: raise ValueError('BSE source error')
            html_text=response.read(650_000).decode('utf-8','replace')
    parser=BseSmeTable()
    parser.feed(html_text)
    results=[]
    today=now or datetime.now(timezone(timedelta(hours=5,minutes=30))).date()
    for cells, url in parser.rows:
        if not re.search(r'[?&]type=IPO(?:&|$)',url,re.I):continue
        if not url.startswith('https://www.bseindia.com/markets/publicIssues/DisplayIPO.aspx?'):
            continue
        try:
            start=datetime.strptime(cells[1],'%d-%m-%Y').date()
            end=datetime.strptime(cells[2],'%d-%m-%Y').date()
        except (ValueError,IndexError):continue
        if end<today-timedelta(days=35) or start>today+timedelta(days=360):continue
        match=re.search(r'[?&]IPONo=(\d+)',url,re.I)
        if not match:continue
        low,high=price_band(cells[3]);name=cells[0][:180]
        if not name or low is None:continue
        item={'id':'BSESME-'+match.group(1),'company':name,'board':'SME',
            'openDate':start.isoformat(),'closeDate':end.isoformat(),
            'status':'UPCOMING' if start>today else 'CLOSED' if end<today else 'OPEN',
            'priceMin':low,'priceMax':high,'lotSize':None,
            'subscription':{'qib':None,'nii':None,'retail':None,'individual':None,'total':None},
            'gmp':None,'gmpAsOf':None,'financials':None,'news':[],
            'detailSource':url,'source':BSE_SME_URL,
            'bidDeadline':None,'mandateDeadline':None}
        results.append(item)
    return results[:75]

def build_snapshot():
    raw=get_json(LIST_URL)
    if not isinstance(raw,list):raise ValueError('NSE listing schema changed')
    issues=[]
    for row in raw[:80]:
        issue=transform_issue(row)
        if issue:issues.append(issue)
    if raw and not issues:raise ValueError('NSE data present but none validates')
    errors=[]
    bse_coverage='Unavailable: source did not respond'
    try:
        bse=recent_bse_sme()
        normalized={re.sub(r'[^a-z0-9]','',i['company'].lower()) for i in issues}
        for issue in bse:
            name=re.sub(r'[^a-z0-9]','',issue['company'].lower())
            if name not in normalized:
                issues.append(issue)
                normalized.add(name)
        bse_coverage='BSE SME website observed; '+str(len(bse))+' recent issues'
    except (ValueError, urllib.error.URLError, TimeoutError) as error:
        errors.append('BSE SME: '+type(error).__name__)
    for issue in issues:
        if issue['status']!='OPEN' or issue['source'] != LIST_URL:continue
        try:enrich_detail(issue)
        except (ValueError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            errors.append(issue['id']+': '+type(error).__name__)
    return {'schemaVersion':1,'generatedAt':datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z'),
        'sourceName':'National Stock Exchange of India','sourceURL':LIST_URL,
        'sourcePolicy':'Public exchange website observations; timestamps indicate snapshot time, not guaranteed real-time licensed market data.',
        'coverage':{'mainboard':'NSE observed','sme':bse_coverage},
        'issues':issues,'warnings':errors[:20]}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=DEFAULT_OUTPUT)
    args=parser.parse_args()
    try:snapshot=build_snapshot()
    except Exception as error:
        print('IPO feed NOT updated:',type(error).__name__,str(error)[:200],file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True,exist_ok=True)
    tmp=args.output.with_suffix('.tmp')
    tmp.write_text(json.dumps(snapshot,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    tmp.replace(args.output)
    print('Verified IPO snapshot:',len(snapshot['issues']),'issues; '+str(len(snapshot['warnings']))+' incomplete detail responses; '+snapshot['generatedAt'])
    return 0
if __name__=='__main__':sys.exit(main())
