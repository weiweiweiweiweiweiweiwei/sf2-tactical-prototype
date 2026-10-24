using System;using System.IO;using System.Collections.Generic;
public static class ApexRaster {
 struct Span { public float lo,hi; public Span(float a,float b){lo=a;hi=b;} }
 public static void Run(string input,string output){
  var cells=new Dictionary<long,List<Span>>();long count=0;
  using(var r=new BinaryReader(File.OpenRead(input))){
   while(r.BaseStream.Position<r.BaseStream.Length){
    double ax=r.ReadSingle(),ay=r.ReadSingle(),az=r.ReadSingle(),bx=r.ReadSingle(),by=r.ReadSingle(),bz=r.ReadSingle(),cx=r.ReadSingle(),cy=r.ReadSingle(),cz=r.ReadSingle();
    double area=(bx-ax)*(cz-az)-(bz-az)*(cx-ax),nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay),ny=-area,nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax),sign=area>=0?1:-1;
    int x0=(int)Math.Floor(Math.Min(ax,Math.Min(bx,cx))),x1=(int)Math.Floor(Math.Max(ax,Math.Max(bx,cx))),z0=(int)Math.Floor(Math.Min(az,Math.Min(bz,cz))),z1=(int)Math.Floor(Math.Max(az,Math.Max(bz,cz)));
    double ymin=Math.Min(ay,Math.Min(by,cy)),ymax=Math.Max(ay,Math.Max(by,cy));
    // Vistas and oversized background planes must not generate kilometres of collision.
    if(ymax < -284 || ymin > 330 || x1-x0>1500 || z1-z0>1500){count++;continue;}
    x0=Math.Max(x0,-909);x1=Math.Min(x1,207);z0=Math.Max(z0,-780);z1=Math.Min(z1,243);
    for(int x=x0;x<=x1;x++)for(int z=z0;z<=z1;z++){
     // Fine village collision is retained separately.
     if(x>=-40&&x<40&&z>=-40&&z<40)continue;
     double X=x+.5,Z=z+.5;
     if(Math.Abs(area)>1e-8){
      if(sign*((bx-ax)*(Z-az)-(bz-az)*(X-ax))<-(Math.Abs(bx-ax)+Math.Abs(bz-az))*.5-1e-7)continue;
      if(sign*((cx-bx)*(Z-bz)-(cz-bz)*(X-bx))<-(Math.Abs(cx-bx)+Math.Abs(cz-bz))*.5-1e-7)continue;
      if(sign*((ax-cx)*(Z-cz)-(az-cz)*(X-cx))<-(Math.Abs(ax-cx)+Math.Abs(az-cz))*.5-1e-7)continue;
     }else{
      double dx=bx-ax,dz=bz-az;if(Math.Abs(dx)+Math.Abs(dz)<Math.Abs(cx-ax)+Math.Abs(cz-az)){dx=cx-ax;dz=cz-az;}
      if(Math.Abs(dx*(Z-az)-dz*(X-ax))>(Math.Abs(dx)+Math.Abs(dz))*.5+1e-7)continue;
     }
     double low=ymin,high=ymax;
     if(Math.Abs(ny)>1e-6){double y=ay-(nx*(X-ax)+nz*(Z-az))/ny,pad=(Math.Abs(nx)+Math.Abs(nz))/Math.Abs(ny)*.5;low=Math.Max(low,y-pad);high=Math.Min(high,y+pad);if(low>high+1e-7)continue;}
     float lo=(float)(Math.Floor((low-.04)*20)/20),hi=(float)(Math.Ceiling((high+.04)*20)/20);
     long key=((long)x<<32)|(uint)z;List<Span> list;if(!cells.TryGetValue(key,out list)){list=new List<Span>();cells[key]=list;}
     for(int i=list.Count-1;i>=0;i--)if(list[i].lo<=hi+.061f&&list[i].hi>=lo-.061f){lo=Math.Min(lo,list[i].lo);hi=Math.Max(hi,list[i].hi);list.RemoveAt(i);}
     list.Add(new Span(lo,hi));
    }
    count++;if(count%1000000==0)Console.WriteLine("RASTER "+count+" cells "+cells.Count);
   }
  }
  long boxes=0;using(var w=new BinaryWriter(File.Create(output)))foreach(var kv in cells){int x=(int)(kv.Key>>32),z=(int)kv.Key;foreach(var s in kv.Value){w.Write((float)x);w.Write(s.lo);w.Write((float)z);w.Write((float)x+1);w.Write(s.hi);w.Write((float)z+1);boxes++;}}
  Console.WriteLine("RASTER_DONE "+count+" triangles "+boxes+" boxes");
 }
}
