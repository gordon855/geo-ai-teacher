import csv,sys,json,statistics,collections
rows=list(csv.DictReader(open(sys.argv[1],encoding='utf-8-sig')))
groups=collections.defaultdict(list)
keys=['provider','language','mode','cold','network','asset','voice','hardware','identityMatch','interruptMode']
for row in rows:groups[tuple(row.get(k,'') for k in keys)].append(row)
def median(rs,key):
    v=[float(r[key]) for r in rs if r.get(key,'')!='']
    return statistics.median(v) if v else None
for condition,rs in groups.items():
    good=[r for r in rs if r.get('success','').lower()=='true'];pron=[r for r in good if r.get('termTotal') and r.get('termErrors')!=''];lips=[float(r['lipScore']) for r in good if r.get('lipScore')];costs=collections.defaultdict(float)
    for r in rs:
        if r.get('cost','')!='':costs[r['currency']+'/'+r['costBasis']]+=float(r['cost'])
    print(json.dumps(dict(zip(keys,condition))|{'attempts':len(rs),'successes':len(good),'successRate':len(good)/len(rs),'firstAudioMedianMs':median(good,'firstAudioMs'),'firstVideoMedianMs':median(good,'firstVideoMs'),'interruptMedianMs':median(good,'interruptMs'),'lipMean':statistics.mean(lips) if lips else None,'termErrorRate':sum(float(r['termErrors']) for r in pron)/sum(float(r['termTotal']) for r in pron) if pron else None,'costTotalsByCurrencyAndBasis':dict(costs)},ensure_ascii=False))
