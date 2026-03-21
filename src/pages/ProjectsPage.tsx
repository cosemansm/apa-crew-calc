import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FolderOpen, Plus, Clock, PoundSterling, ChevronRight,
  Calendar, User, ArrowLeft, Edit3, X
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Project {
  id: string;
  name: string;
  client_name: string | null;
  created_at: string;
}

interface ProjectDay {
  id: string;
  project_id: string;
  work_date: string;
  role_name: string;
  day_type: string;
  call_time: string;
  wrap_time: string;
  grand_total: number;
  agreed_rate: number;
  result_json?: {
    lineItems?: { description: string; hours: number; rate: number; total: number }[];
    penalties?: { description: string; hours: number; rate: number; total: number }[];
    travelPay?: number;
    mileage?: number;
    mileageMiles?: number;
    subtotal?: number;
  };
}

const DAY_TYPE_LABELS: Record<string, string> = {
  basic_working: 'Basic Working Day',
  continuous_working: 'Continuous Working Day',
  travel: 'Travel Day',
  rest: 'Rest Day',
  prep: 'Prep Day',
  recce: 'Recce Day',
  build_strike: 'Build/Strike',
  pre_light: 'Pre-light',
};

export function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectDays, setProjectDays] = useState<ProjectDay[]>([]);
  const [daysLoading, setDaysLoading] = useState(false);

  useEffect(() => {
    if (user) loadProjects();
  }, [user]);

  const loadProjects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });
    if (data) setProjects(data);
    setLoading(false);
  };

  const selectProject = async (project: Project) => {
    setSelectedProject(project);
    setDaysLoading(true);
    const { data } = await supabase
      .from('project_days')
      .select('*')
      .eq('project_id', project.id)
      .order('work_date', { ascending: true });
    setProjectDays(data || []);
    setDaysLoading(false);
  };

  const closeDetail = () => {
    setSelectedProject(null);
    setProjectDays([]);
  };

  const projectTotal = projectDays.reduce((sum, d) => sum + (d.grand_total || 0), 0);

  const dateRange = projectDays.length > 0
    ? `${format(parseISO(projectDays[0].work_date), 'dd MMM yyyy')}${
        projectDays.length > 1
          ? ` – ${format(parseISO(projectDays[projectDays.length - 1].work_date), 'dd MMM yyyy')}`
          : ''
      }`
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">All your crew booking projects</p>
        </div>
        <Button onClick={() => navigate('/calculator')} className="gap-2">
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading projects…</div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FolderOpen className="h-14 w-14 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">No projects yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first project to get started</p>
            <Button onClick={() => navigate('/calculator')}>
              <Plus className="h-4 w-4 mr-1" /> Create Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Project list — left */}
          <div className={`${selectedProject ? 'lg:col-span-2' : 'lg:col-span-5'}`}>
            <div className={`grid gap-3 ${selectedProject ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'}`}>
              {projects.map(project => {
                const isSelected = selectedProject?.id === project.id;
                return (
                  <div
                    key={project.id}
                    onClick={() => isSelected ? closeDetail() : selectProject(project)}
                    className={`rounded-2xl border p-4 cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? 'border-[#FFD528] bg-[#FFD528]/5 shadow-[0_0_0_2px_#FFD528]'
                        : 'bg-white border-border hover:shadow-md hover:border-[#1F1F21]/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{project.name}</p>
                        {project.client_name && (
                          <p className="text-sm text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                            <User className="h-3 w-3 shrink-0" />
                            {project.client_name}
                          </p>
                        )}
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      <Calendar className="h-3 w-3 inline mr-1" />
                      Created {format(parseISO(project.created_at), 'dd MMM yyyy')}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Project detail — right */}
          {selectedProject && (
            <div className="lg:col-span-3">
              <Card className="sticky top-6">
                {/* Detail header */}
                <div className="flex items-start justify-between p-6 pb-4 border-b border-border">
                  <div>
                    <h2 className="text-xl font-bold">{selectedProject.name}</h2>
                    {selectedProject.client_name && (
                      <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {selectedProject.client_name}
                      </p>
                    )}
                    {dateRange && (
                      <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {dateRange}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => navigate(`/calculator?project=${selectedProject.id}`)}
                      className="gap-1.5"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit in Calculator
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeDetail}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <CardContent className="p-6">
                  {daysLoading ? (
                    <p className="text-sm text-muted-foreground">Loading days…</p>
                  ) : projectDays.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">No days saved yet</p>
                      <Button
                        size="sm"
                        className="mt-3 gap-1.5"
                        onClick={() => navigate(`/calculator?project=${selectedProject.id}`)}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Open in Calculator
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {projectDays.map((day, idx) => {
                        const lineItems = day.result_json?.lineItems || [];
                        const penalties = day.result_json?.penalties || [];
                        const travelPay = day.result_json?.travelPay || 0;
                        const mileagePay = day.result_json?.mileage || 0;
                        return (
                          <div key={day.id} className="rounded-xl border border-border overflow-hidden">
                            {/* Day header */}
                            <div className="flex items-center justify-between px-4 py-3 bg-muted/40">
                              <div className="flex items-center gap-3">
                                <div className="h-7 w-7 rounded-full bg-[#1F1F21] flex items-center justify-center shrink-0">
                                  <span className="text-[11px] font-bold text-white">{idx + 1}</span>
                                </div>
                                <div>
                                  <p className="text-sm font-semibold">
                                    {format(parseISO(day.work_date), 'EEEE dd MMM yyyy')}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {DAY_TYPE_LABELS[day.day_type] || day.day_type}
                                    {day.call_time && day.wrap_time && ` · ${day.call_time} – ${day.wrap_time}`}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-bold">£{(day.grand_total || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <p className="text-xs text-muted-foreground">{day.role_name}</p>
                              </div>
                            </div>

                            {/* Line items */}
                            {(lineItems.length > 0 || penalties.length > 0 || travelPay > 0 || mileagePay > 0) && (
                              <div className="px-4 py-2 space-y-1">
                                {lineItems.map((item, i) => (
                                  <div key={i} className="flex justify-between text-xs text-muted-foreground">
                                    <span>{item.description}</span>
                                    <span className="font-medium text-foreground">£{item.total.toFixed(2)}</span>
                                  </div>
                                ))}
                                {penalties.map((item, i) => (
                                  <div key={`pen-${i}`} className="flex justify-between text-xs text-orange-600">
                                    <span>{item.description}</span>
                                    <span className="font-medium">£{item.total.toFixed(2)}</span>
                                  </div>
                                ))}
                                {travelPay > 0 && (
                                  <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Travel pay</span>
                                    <span className="font-medium text-foreground">£{travelPay.toFixed(2)}</span>
                                  </div>
                                )}
                                {mileagePay > 0 && (
                                  <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Mileage ({day.result_json?.mileageMiles || 0} mi)</span>
                                    <span className="font-medium text-foreground">£{mileagePay.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Project total */}
                      <div className="flex items-center justify-between rounded-xl bg-[#1F1F21] px-4 py-3 mt-2">
                        <div className="flex items-center gap-2">
                          <PoundSterling className="h-4 w-4 text-[#FFD528]" />
                          <span className="text-sm font-bold text-white">Project Total</span>
                        </div>
                        <span className="text-lg font-bold text-[#FFD528]">
                          £{projectTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <Button
                        className="w-full gap-2 mt-1"
                        onClick={() => navigate(`/calculator?project=${selectedProject.id}`)}
                      >
                        <Edit3 className="h-4 w-4" />
                        Edit in Calculator
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
