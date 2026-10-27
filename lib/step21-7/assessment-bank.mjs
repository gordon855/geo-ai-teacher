import all from '../step20/bank.json' with {type:'json'};
import course from '../step20-1/course-bank.json' with {type:'json'};
import definitions from './definitions.json' with {type:'json'};
export {definitions};
export const assessmentBank=all.map(u=>{const c=course.find(c=>c.unit===u.unit);return c?{...c,questions:[...c.questions.filter(q=>q.kind!=='principle'),...definitions.filter(q=>q.unit===u.unit)]}:u;});
