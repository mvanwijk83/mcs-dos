// Independent native BAM audit: validate must retain live directory/file blocks.
const assert=require('assert/strict');
module.exports=function nativeAllocation(bytes){
    const headers=[[1,1]],seen=new Set();let files=0;
    function allocated(t,s){
        assert(t>=1&&t<=255&&s>=0&&s<=255);
        const offset=((t-1)*256+s)*256;
        assert(offset+256<=bytes.length);
        const bam=512+32+(t-1)*32+(s>>3),bit=0x80>>(s&7);
        assert(!(bytes[bam]&bit),'live native sector '+t+':'+s+' remains allocated');
        assert(!seen.has(offset),'native directory/file sectors do not overlap');seen.add(offset);
        return offset;
    }
    function chain(t,s,visit){
        while(t){const o=allocated(t,s);if(visit)visit(o);t=bytes[o];s=bytes[o+1];}
    }
    while(headers.length){
        const [t,s]=headers.pop(),header=allocated(t,s);
        chain(bytes[header],bytes[header+1],o=>{
            for(let n=0;n<256;n+=32){
                const p=o+n,type=bytes[p+2]&7;
                if(type===6)headers.push([bytes[p+3],bytes[p+4]]);
                else if(type>=1&&type<=4){++files;chain(bytes[p+3],bytes[p+4]);}
            }
        });
    }
    return {files,sectors:seen.size};
};
